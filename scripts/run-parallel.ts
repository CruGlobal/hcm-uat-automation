/**
 * Run all tests in parallel using bot users.
 *
 * Each of the 19 bot users gets its own Playwright process with an independent
 * Oracle HCM session (direct login, no SSO). Tests are partitioned by testerName
 * → bot mapping. Each process sets PARALLEL_BOT=<botName> so isTestable() filters
 * to only that bot's tests.
 *
 * When clones exist (e.g., bot_hr_admin_1..5 in credentials file), a base bot's
 * tests are distributed round-robin across the base + its clones. This gives up to
 * 6 accounts per role (base + 5 clones) = 114 parallel processes.
 *
 * Usage:
 *   npx tsx scripts/run-parallel.ts                        # All bots, all tests
 *   npx tsx scripts/run-parallel.ts --bots 5               # First 5 base bots only
 *   npx tsx scripts/run-parallel.ts --module "Core HR"      # One module only
 *   npx tsx scripts/run-parallel.ts --one-per-bot           # One test per bot (smoke test)
 *   npx tsx scripts/run-parallel.ts --no-clones             # Ignore clones, use base bots only
 *   npx tsx scripts/run-parallel.ts --skip-reset            # Skip SCIM password reset for clones
 *   npx tsx scripts/run-parallel.ts --status "Not Started"  # Only tests with specific status
 *   npx tsx scripts/run-parallel.ts --status "Not Started,Failed"  # Multiple statuses
 *   RUN_PASSED_ONLY=true npx tsx scripts/run-parallel.ts   # Only "Passed" tests
 *   RUN_FAILED_ONLY=true npx tsx scripts/run-parallel.ts   # Only "Failed" tests
 */
import { spawn, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadUATPlan, isTestable } from '../src/data/uat-plan-provider';
import { getBotForTester, getBotCredentials, getClonesForBot } from '../src/config/bot-users';
import { getAccessToken, getSheetTabs, readSheetTab, getTrackingSheetId } from './lib/google-sheets';
import { parsePlaywrightReport, mapStatus } from './update-tracking-sheet';
import { scimLookupUser, scimResetPassword } from './lib/hcm-rest-api';

// Parse args
const args = process.argv.slice(2);
const maxBots = parseInt(args[args.indexOf('--bots') + 1] || '0', 10) || Infinity;
const moduleFilter = args.includes('--module') ? args[args.indexOf('--module') + 1] : null;
const onePerBot = args.includes('--one-per-bot');
const noClones = args.includes('--no-clones');
const maxClonesPerBot = args.includes('--clones') ? parseInt(args[args.indexOf('--clones') + 1] || '5', 10) : Infinity;
const skipReset = args.includes('--skip-reset');
const statusFilter = args.includes('--status') ? args[args.indexOf('--status') + 1] : null;
const trackingStatusFilter = args.includes('--tracking-status') ? args[args.indexOf('--tracking-status') + 1] : null;
const maxProcessesArg = args.includes('--max-processes') ? parseInt(args[args.indexOf('--max-processes') + 1] || '70', 10) : null;

// ─── Hard cap on concurrent Playwright processes (system-wide) ───────────────
const HARD_CAP = maxProcessesArg ?? 50;

function countExistingPlaywrightProcesses(): number {
  try {
    const result = execFileSync('pgrep', ['-c', '-f', 'playwright test'], { encoding: 'utf-8', timeout: 5000 });
    return parseInt(result.trim(), 10) || 0;
  } catch {
    // pgrep returns exit code 1 when no processes match — that means 0
    return 0;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface TestInfo { testId: string; bp: string; module: string; category: string }

// ─── Snapshot: capture tracking sheet status before the run ───────────────────

interface StatusSnapshot {
  /** testId → current status string (e.g. "Passed", "Failed", "", etc.) */
  byTestId: Map<string, string>;
  /** module → { total, passed, failed } */
  byModule: Map<string, { total: number; passed: number; failed: number }>;
}

async function captureSnapshot(): Promise<StatusSnapshot | null> {
  const spreadsheetId = getTrackingSheetId();
  if (!spreadsheetId) return null;

  try {
    const accessToken = await getAccessToken();
    const tabs = await getSheetTabs(accessToken, spreadsheetId);

    const byTestId = new Map<string, string>();
    const byModule = new Map<string, { total: number; passed: number; failed: number }>();

    // Known module tabs (skip Summary and other non-module tabs)
    const moduleTabs = [
      'Core HR', 'Payroll', 'Absence Management', 'Benefits',
      'Time and Labor', 'Journeys', 'Workforce Compensation',
      'MPDX', 'OneApp', 'SAA', 'Other Functions',
    ];

    for (const tab of moduleTabs) {
      if (!tabs.includes(tab)) continue;
      const rows = await readSheetTab(accessToken, spreadsheetId, tab);
      if (rows.length < 2) continue;

      let passed = 0, failed = 0;
      for (let i = 1; i < rows.length; i++) {
        const testId = (rows[i][0] || '').trim();
        const status = (rows[i][9] || '').trim(); // Column J = Status (0-indexed col 9)
        if (!testId) continue;
        // First non-empty status wins — duplicate rows (same testId) should not
        // overwrite a "Passed"/"Failed" row with an empty one.
        if (!byTestId.has(testId) || !byTestId.get(testId)) {
          byTestId.set(testId, status);
        }
        if (status === 'Passed') passed++;
        else if (status === 'Failed') failed++;
      }
      byModule.set(tab, { total: rows.length - 1, passed, failed });
    }

    console.log(`[Snapshot] Captured ${byTestId.size} test statuses from ${byModule.size} modules`);
    return { byTestId, byModule };
  } catch (err: any) {
    console.warn(`[Snapshot] Could not capture: ${err.message}`);
    return null;
  }
}

// ─── Progress report: compare before/after ───────────────────────────────────

function printProgressReport(
  snapshot: StatusSnapshot,
  mergedReportPath: string,
) {
  // Parse the merged Playwright report to get new results
  const results = parsePlaywrightReport(mergedReportPath);

  // Build new results map: testId → mapped status
  const newResults = new Map<string, string>();
  for (const r of results) {
    if (!r.testId || r.status === 'skipped') continue;
    newResults.set(r.testId, mapStatus(r));
  }

  // Compute deltas per module
  interface ModuleDelta {
    total: number;
    passed: number;
    failed: number;
    newlyPassed: number;
    newlyFailed: number;
    fixed: number;       // was Failed → now Passed
    regressions: number; // was Passed → now Failed
  }

  const moduleTabs = [
    'Core HR', 'Payroll', 'Absence Management', 'Benefits',
    'Time and Labor', 'Journeys', 'Workforce Compensation',
    'MPDX', 'OneApp', 'SAA', 'Other Functions',
  ];

  const moduleDeltas = new Map<string, ModuleDelta>();
  let overallNewlyPassed = 0, overallNewlyFailed = 0, overallFixed = 0, overallRegressions = 0;

  // Group new results by module
  const resultsByModule = new Map<string, Map<string, string>>();
  for (const r of results) {
    if (!r.testId || r.status === 'skipped') continue;
    const mod = r.module.replace(/\s*\(UAT Plan\)/, '');
    if (!resultsByModule.has(mod)) resultsByModule.set(mod, new Map());
    resultsByModule.get(mod)!.set(r.testId, mapStatus(r));
  }

  for (const tab of moduleTabs) {
    const moduleResults = resultsByModule.get(tab);
    const prevStats = snapshot.byModule.get(tab);
    if (!moduleResults && !prevStats) continue;

    let newlyPassed = 0, newlyFailed = 0, fixed = 0, regressions = 0;

    if (moduleResults) {
      for (const [testId, newStatus] of moduleResults) {
        const prevStatus = snapshot.byTestId.get(testId) || '';

        if (newStatus === 'Passed') {
          if (prevStatus !== 'Passed') {
            newlyPassed++;
            if (prevStatus === 'Failed') fixed++;
          }
        } else if (newStatus === 'Failed') {
          if (prevStatus !== 'Failed') {
            newlyFailed++;
            if (prevStatus === 'Passed') regressions++;
          }
        }
      }
    }

    // Compute post-run totals by applying deltas to snapshot
    const prevPassed = prevStats?.passed || 0;
    const prevFailed = prevStats?.failed || 0;
    const total = prevStats?.total || (moduleResults?.size || 0);
    const passed = prevPassed + newlyPassed - regressions;
    const failed = prevFailed + newlyFailed - fixed;

    moduleDeltas.set(tab, { total, passed, failed, newlyPassed, newlyFailed, fixed, regressions });
    overallNewlyPassed += newlyPassed;
    overallNewlyFailed += newlyFailed;
    overallFixed += fixed;
    overallRegressions += regressions;
  }

  // Print the report
  const W = 78;
  console.log(`\n${'='.repeat(W)}`);
  console.log('  PROGRESS REPORT');
  console.log(`${'='.repeat(W)}`);
  console.log(`  ${'Module'.padEnd(30)} ${'Total'.padStart(5)}  ${'Passed'.padStart(6)}  ${'Failed'.padStart(6)}  ${'Rate'.padStart(5)}   Delta`);
  console.log(`  ${'─'.repeat(W - 4)}`);

  let grandTotal = 0, grandPassed = 0, grandFailed = 0;

  for (const tab of moduleTabs) {
    const d = moduleDeltas.get(tab);
    if (!d) continue;
    grandTotal += d.total;
    grandPassed += d.passed;
    grandFailed += d.failed;

    const rate = d.total > 0 ? `${Math.round(100 * d.passed / d.total)}%` : '—';

    const deltaParts: string[] = [];
    if (d.newlyPassed > 0) deltaParts.push(`+${d.newlyPassed} passed`);
    if (d.newlyFailed > 0) deltaParts.push(`+${d.newlyFailed} failed`);
    if (d.fixed > 0) deltaParts.push(`${d.fixed} fixed`);
    if (d.regressions > 0) deltaParts.push(`${d.regressions} regressed`);
    const deltaStr = deltaParts.length > 0 ? deltaParts.join(', ') : '—';

    console.log(`  ${tab.padEnd(30)} ${String(d.total).padStart(5)}  ${String(d.passed).padStart(6)}  ${String(d.failed).padStart(6)}  ${rate.padStart(5)}   ${deltaStr}`);
  }

  console.log(`  ${'─'.repeat(W - 4)}`);
  const grandRate = grandTotal > 0 ? `${Math.round(100 * grandPassed / grandTotal)}%` : '—';
  console.log(`  ${'TOTAL'.padEnd(30)} ${String(grandTotal).padStart(5)}  ${String(grandPassed).padStart(6)}  ${String(grandFailed).padStart(6)}  ${grandRate.padStart(5)}`);

  // Progress bar
  const barWidth = 40;
  const pct = grandTotal > 0 ? grandPassed / grandTotal : 0;
  const filled = Math.round(pct * barWidth);
  const bar = '#'.repeat(filled) + '.'.repeat(barWidth - filled);
  console.log(`\n  Progress: [${bar}] ${Math.round(pct * 100)}% (${grandPassed}/${grandTotal})`);

  const summaryParts: string[] = [];
  if (overallNewlyPassed > 0) summaryParts.push(`+${overallNewlyPassed} newly passed`);
  if (overallNewlyFailed > 0) summaryParts.push(`+${overallNewlyFailed} newly failed`);
  summaryParts.push(`${overallFixed} fixed`);
  summaryParts.push(`${overallRegressions} regressions`);
  console.log(`  This run: ${summaryParts.join(', ')}\n`);
}

function raiseFileDescriptorLimit(): void {
  // Each spawned Chromium process needs ~15 FDs; 128 processes × 15 = ~2000 needed.
  // Default soft limit is 1024, which causes spawn failures around process 87.
  // prlimit (util-linux) can raise limits of the current process by PID.
  const targets = [65536, 16384, 4096];
  for (const target of targets) {
    try {
      execFileSync('prlimit', [`--nofile=${target}:${target}`, `--pid`, String(process.pid)], { stdio: 'pipe' });
      console.log(`  [FD limit] Raised to ${target} (was likely 1024)`);
      return;
    } catch { /* try next lower value */ }
  }
  console.warn('  [FD limit] Could not raise file descriptor limit — spawn failures may occur above ~87 processes');
}

const RUN_COUNTER_FILE = path.resolve('.cache', 'run-counter.json');

function getAndIncrementRunCounter(): number {
  let counter = 1;
  if (fs.existsSync(RUN_COUNTER_FILE)) {
    try {
      counter = JSON.parse(fs.readFileSync(RUN_COUNTER_FILE, 'utf-8')).counter + 1;
    } catch { /* start from 1 */ }
  }
  fs.mkdirSync(path.dirname(RUN_COUNTER_FILE), { recursive: true });
  fs.writeFileSync(RUN_COUNTER_FILE, JSON.stringify({ counter }, null, 2));
  return counter;
}

// ─── Pre-run SCIM password reset for clone bots ──────────────────────────────

const SCIM_ADMIN_CREDS = {
  username: process.env.ORACLE_API_USERNAME || '',
  password: process.env.ORACLE_API_PASSWORD || '',
};
const BOT_PASSWORD = process.env.BOT_PASSWORD || process.env.ORACLE_API_PASSWORD || '';
const TEMP_PASSWORD = 'TempReset!!2026XY@cru';

async function resetClonePasswords(): Promise<void> {
  const baseUrl = process.env.ORACLE_HCM_URL;
  if (!baseUrl) {
    console.warn('  [Password Reset] ORACLE_HCM_URL not set — skipping');
    return;
  }

  const credsPath = path.resolve('.config', 'bot-credentials.json');
  if (!fs.existsSync(credsPath)) {
    console.warn('  [Password Reset] .config/bot-credentials.json not found — skipping');
    return;
  }

  const allCreds: Record<string, { username: string; password: string }> = JSON.parse(
    fs.readFileSync(credsPath, 'utf-8'),
  );

  // Filter to clone accounts only (names ending in _\d+)
  const cloneNames = Object.keys(allCreds).filter(name => /_\d+$/.test(name));
  if (cloneNames.length === 0) {
    console.log('  [Password Reset] No clone accounts found — skipping');
    return;
  }

  console.log(`  [Password Reset] Resetting passwords for ${cloneNames.length} clone accounts...`);
  const t0 = Date.now();

  let direct = 0, twoPhase = 0, failed = 0;
  const errors: string[] = [];

  // Process in batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < cloneNames.length; i += BATCH_SIZE) {
    const batch = cloneNames.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (name) => {
      const username = allCreds[name].username; // e.g. "uat.bot_hr_admin_1"
      try {
        // Look up SCIM user
        const user = await scimLookupUser(baseUrl, username, SCIM_ADMIN_CREDS);
        if (!user) {
          errors.push(`${name}: user not found`);
          return 'failed';
        }

        // Try direct password reset first
        const ok = await scimResetPassword(baseUrl, user.id, BOT_PASSWORD, SCIM_ADMIN_CREDS);
        if (ok) return 'direct';

        // Two-phase: set temp password, then set final password
        const tempOk = await scimResetPassword(baseUrl, user.id, TEMP_PASSWORD, SCIM_ADMIN_CREDS);
        if (!tempOk) {
          errors.push(`${name}: temp password failed`);
          return 'failed';
        }
        const finalOk = await scimResetPassword(baseUrl, user.id, BOT_PASSWORD, SCIM_ADMIN_CREDS);
        if (!finalOk) {
          errors.push(`${name}: final password failed`);
          return 'failed';
        }
        return 'two-phase';
      } catch (err: any) {
        errors.push(`${name}: ${err.message?.slice(0, 80)}`);
        return 'failed';
      }
    }));

    for (const r of results) {
      if (r === 'direct') direct++;
      else if (r === 'two-phase') twoPhase++;
      else failed++;
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  [Password Reset] ${cloneNames.length} clones reset (${direct} direct, ${twoPhase} two-phase, ${failed} failed) in ${elapsed}s`);
  if (errors.length > 0) {
    for (const e of errors.slice(0, 5)) console.warn(`    - ${e}`);
    if (errors.length > 5) console.warn(`    ... and ${errors.length - 5} more`);
  }
}

async function main() {
  raiseFileDescriptorLimit();

  // Increment run counter for idempotent hire/create tests
  const runCounter = getAndIncrementRunCounter();
  console.log(`  [Run counter] ${runCounter} (hire tests will use unique names/SSNs)\n`);

  // Reset clone bot passwords via SCIM before spawning test processes
  if (skipReset) {
    console.log('  [Password Reset] Skipped (--skip-reset)\n');
  } else {
    await resetClonePasswords();
    console.log('');
  }

  // Parse --status filter
  const statusFilterValues = statusFilter
    ? statusFilter.split(',').map(s => s.trim().toLowerCase())
    : null;

  // --tracking-status: fetch tracking sheet now and build a set of matching testIds
  let trackingStatusTestIds: Set<string> | null = null;
  if (trackingStatusFilter) {
    const filterValues = trackingStatusFilter.split(',').map(s => s.trim().toLowerCase());
    console.log(`  Fetching tracking sheet to filter by status: ${trackingStatusFilter}...`);
    const snap = await captureSnapshot();
    if (!snap) {
      console.error('  Could not fetch tracking sheet — cannot apply --tracking-status filter');
      process.exit(1);
    }
    trackingStatusTestIds = new Set<string>();
    for (const [testId, status] of snap.byTestId) {
      // "Not Run" on the sheet = empty string or literally "Not Run"
      const normalized = status.trim().toLowerCase();
      if (filterValues.some(f => f === 'not run' ? (normalized === 'not run' || normalized === '') : normalized === f)) {
        trackingStatusTestIds.add(testId);
      }
    }
    console.log(`  Found ${trackingStatusTestIds.size} tests with tracking status matching "${trackingStatusFilter}"\n`);
  }

  // Group testable tests by bot user
  const allTests = loadUATPlan().filter(tc => {
    // Apply base testability (but not PARALLEL_BOT — we're the orchestrator)
    const status = tc.status.toLowerCase();
    if (status === 'deferred' || status === 'cancelled') return false;
    if (!tc.businessProcess && !tc.testScript && !tc.transactionCategory) return false;
    // --status filter
    if (statusFilterValues) {
      if (!statusFilterValues.includes(status)) return false;
    }
    if (process.env.RUN_PASSED_ONLY) {
      if (status !== 'passed' && status !== 'pass') return false;
    }
    if (process.env.RUN_FAILED_ONLY) {
      if (status !== 'failed' && status !== 'fail') return false;
    }
    if (moduleFilter) {
      const effectiveModule = tc.module || tc.tabName || '';
      if (effectiveModule !== moduleFilter) return false;
    }
    // --tracking-status filter: only include tests present in the tracking sheet with matching status
    if (trackingStatusTestIds !== null) {
      if (!trackingStatusTestIds.has(tc.testId)) return false;
    }
    return true;
  });

  const botTests = new Map<string, TestInfo[]>();

  for (const tc of allTests) {
    const bot = getBotForTester(tc.testerName, tc.module || tc.tabName);
    if (!getBotCredentials(bot.botName)) continue;
    const tests = botTests.get(bot.botName) || [];
    tests.push({ testId: tc.testId, bp: tc.businessProcess, module: tc.module || tc.tabName, category: tc.transactionCategory || '' });
    botTests.set(bot.botName, tests);
  }

  // Build process list — distribute tests across base bots + clones
  //
  // ESS tests (Employee Self-Service) in Absence/Benefits/T&L log in as the TARGET
  // EMPLOYEE via SCIM, not the bot user. So ESS tests can run highly in parallel —
  // the bot account is only used as a brief fallback. We split ESS-heavy batches
  // into smaller groups and cycle through clone accounts (sharing is safe since
  // each process uses a unique employee login).
  const ESS_MODULES = new Set(['Absence Management', 'Benefits', 'Time and Labor']);
  const MAX_ESS_BATCH = 5; // max ESS tests per process for better parallelism

  // A test is "ESS" if it's in an ESS module AND the transaction category indicates
  // employee self-service (not HR specialist or manager, who use the bot's own login).
  const isEssTest = (t: TestInfo): boolean => {
    if (!ESS_MODULES.has(t.module)) return false;
    const cat = t.category.toLowerCase();
    return cat.includes('employee') || cat.includes('ess');
  };

  type ProcessEntry = { accountName: string; baseBotName: string; tests: TestInfo[] };
  const processes: ProcessEntry[] = [];

  const baseBots = [...botTests.entries()]
    .sort((a, b) => b[1].length - a[1].length) // largest first
    .slice(0, maxBots);

  for (const [baseBotName, tests] of baseBots) {
    // Separate ESS tests from admin tests for this bot
    const essTests = tests.filter(isEssTest);
    const adminTests = tests.filter(t => !isEssTest(t));

    if (noClones) {
      // No clone distribution — one process per base bot (original behavior)
      processes.push({ accountName: baseBotName, baseBotName, tests });
      continue;
    }

    // Find clones for this base bot
    const cloneNames = getClonesForBot(baseBotName);
    const limitedClones = cloneNames.slice(0, maxClonesPerBot);
    const accounts = [baseBotName, ...limitedClones];

    if (essTests.length === 0 || essTests.length <= accounts.length) {
      // Few or no ESS tests — standard round-robin across bot + clones
      const buckets: TestInfo[][] = accounts.map(() => []);
      for (let i = 0; i < tests.length; i++) {
        buckets[i % accounts.length].push(tests[i]);
      }
      for (let i = 0; i < accounts.length; i++) {
        if (buckets[i].length > 0) {
          processes.push({ accountName: accounts[i], baseBotName, tests: buckets[i] });
        }
      }
      continue;
    }

    // ESS-heavy bot: distribute admin tests across bot's own accounts,
    // then split ESS tests into small batches using any available clone
    if (adminTests.length > 0) {
      const adminBuckets: TestInfo[][] = accounts.map(() => []);
      for (let i = 0; i < adminTests.length; i++) {
        adminBuckets[i % accounts.length].push(adminTests[i]);
      }
      for (let i = 0; i < accounts.length; i++) {
        if (adminBuckets[i].length > 0) {
          processes.push({ accountName: accounts[i], baseBotName, tests: adminBuckets[i] });
        }
      }
    }

    // Split ESS tests into batches of MAX_ESS_BATCH.
    // ESS tests log in as the TARGET EMPLOYEE (not the bot), so multiple processes
    // can safely share the same bot account — the bot login is only used as a
    // brief fallback when employee SCIM provisioning fails.
    const essBatches: TestInfo[][] = [];
    for (let i = 0; i < essTests.length; i += MAX_ESS_BATCH) {
      essBatches.push(essTests.slice(i, i + MAX_ESS_BATCH));
    }

    // Cycle through bot's own accounts for ESS batches (reuse is OK for ESS)
    const essAccounts = adminTests.length > 0
      ? [...limitedClones] // admin already claimed some accounts; use remaining clones
      : [...accounts]; // no admin tests — use all accounts
    if (essAccounts.length === 0) essAccounts.push(baseBotName); // ensure at least one

    for (let i = 0; i < essBatches.length; i++) {
      const account = essAccounts[i % essAccounts.length];
      processes.push({ accountName: account, baseBotName, tests: essBatches[i] });
    }
  }

  if (processes.length === 0) {
    console.log('No testable tests found for any bot user.');
    console.log('Ensure .cache/uat-plan.json exists and .config/bot-credentials.json has credentials.');
    process.exit(1);
  }

  // ─── Enforce hard cap on system-wide Playwright processes ──────────────────
  const existingProcesses = countExistingPlaywrightProcesses();
  const availableSlots = HARD_CAP - existingProcesses;
  if (availableSlots <= 0) {
    console.error(`\n  ❌ HARD CAP EXCEEDED: ${existingProcesses} Playwright processes already running (cap: ${HARD_CAP}).`);
    console.error('  Wait for existing runs to finish or stop them before starting a new run.');
    process.exit(1);
  }
  if (processes.length > availableSlots) {
    console.log(`\n  ⚠️  Capping processes: ${processes.length} planned but only ${availableSlots} slots available (${existingProcesses} already running, cap: ${HARD_CAP})`);
    // Ensure every base bot gets at least 1 process, then fill remaining with clones
    const baseBotProcesses = new Map<string, typeof processes>();
    for (const p of processes) {
      if (!baseBotProcesses.has(p.baseBotName)) baseBotProcesses.set(p.baseBotName, []);
      baseBotProcesses.get(p.baseBotName)!.push(p);
    }
    // First pass: take 1 process per base bot (the one with most tests)
    const kept: typeof processes = [];
    for (const [_bot, procs] of baseBotProcesses) {
      procs.sort((a, b) => b.tests.length - a.tests.length);
      kept.push(procs[0]); // Keep the biggest process for each bot
    }
    // Second pass: fill remaining slots with clone processes (most tests first)
    const remaining = processes.filter(p => !kept.includes(p));
    remaining.sort((a, b) => b.tests.length - a.tests.length);
    let slotsLeft = availableSlots - kept.length;
    for (const p of remaining) {
      if (slotsLeft <= 0) break;
      kept.push(p);
      slotsLeft--;
    }
    const droppedCount = processes.length - kept.length;
    const droppedTests = processes.filter(p => !kept.includes(p)).reduce((s, p) => s + p.tests.length, 0);
    processes.length = 0;
    processes.push(...kept);
    console.log(`  Kept ${kept.length} processes (${baseBotProcesses.size} base bots guaranteed). Dropped ${droppedCount} clone processes (${droppedTests} tests — run a second pass to cover them).\n`);
  } else if (existingProcesses > 0) {
    console.log(`  [Process cap] ${existingProcesses} existing + ${processes.length} new = ${existingProcesses + processes.length} / ${HARD_CAP} max`);
  }

  const totalTests = processes.reduce((sum, p) => sum + p.tests.length, 0);
  const filters = [
    moduleFilter ? `module: ${moduleFilter}` : '',
    statusFilter ? `status: ${statusFilter}` : '',
    trackingStatusFilter ? `tracking-status: ${trackingStatusFilter}` : '',
    process.env.RUN_PASSED_ONLY ? 'passed-only' : '',
    process.env.RUN_FAILED_ONLY ? 'failed-only' : '',
  ].filter(Boolean).join(', ');
  console.log(`\nParallel run: ${processes.length} processes (${baseBots.length} base bots), ${totalTests} total tests${filters ? ` (${filters})` : ''}`);
  console.log(`(Expected test result count: ${totalTests})\n`);
  for (const p of processes) {
    console.log(`  ${p.accountName.padEnd(35)} ${p.tests.length} tests`);
  }
  console.log('');

  // ─── Snapshot tracking sheet before the run ──────────────────────────────────
  const snapshot = await captureSnapshot();

  const startTime = Date.now();
  console.log(`  Starting at ${new Date(startTime).toLocaleTimeString()}...\n`);

  // Build env vars for child processes
  const childEnvExtras: Record<string, string> = {
    RUN_COUNTER: String(runCounter),
  };
  if (statusFilterValues) {
    childEnvExtras.RUN_STATUS_FILTER = statusFilterValues.join(',');
  }

  // Track progress for live updates
  let globalPassed = 0;
  let globalFailed = 0;
  let completedCount = 0;
  let spawnedCount = 0;

  // Sheet updates are handled automatically by the TrackingSheetReporter in each
  // child Playwright process (registered in playwright.parallel.config.ts).

  // Stagger process spawning to avoid overwhelming Oracle OAM login server.
  // Each process gets a small delay so logins don't all hit simultaneously.
  const STAGGER_MS = processes.length > 20 ? 2000 : 500;
  console.log(`  Spawning ${processes.length} processes (${STAGGER_MS}ms stagger)...\n`);

  type ProcResult = { accountName: string; testCount: number; exitCode: number; output: string; duration: number; passed: number; failed: number };
  const promises: Promise<ProcResult>[] = [];

  for (let idx = 0; idx < processes.length; idx++) {
    if (idx > 0) await new Promise(r => setTimeout(r, STAGGER_MS));
    const proc = processes[idx];
    promises.push(new Promise<ProcResult>((resolve) => {
    const t0 = Date.now();

    // PARALLEL_BOT is the BASE bot name so isTestable() picks up the right tests.
    // The account is only used for login credentials. For ESS tests, the account
    // may be a clone from a different bot — that's fine since ESS tests log in
    // as the target employee anyway.
    const baseBotName = proc.baseBotName;

    // Build args
    const playwrightArgs = [
      'playwright', 'test',
      '--config', 'playwright.parallel.config.ts',
    ];

    if (onePerBot) {
      // Smoke test mode: one test per bot via --grep
      const grepPattern = `${escapeRegex(proc.tests[0].testId)}: `;
      playwrightArgs.push('--grep', grepPattern);
    } else if (proc.tests.length > 0) {
      // Always use --grep to run exactly the assigned tests.
      // For clone accounts this restricts to a specific subset; for base bots this
      // ensures filtered runs (e.g. --tracking-status) only run the intended tests
      // rather than the full bot test suite (which can be 100+ tests).
      const grepPattern = proc.tests.map(t => escapeRegex(t.testId)).join('|');
      playwrightArgs.push('--grep', grepPattern);
    }

    let child;
    try {
      child = spawn('npx', playwrightArgs, {
        env: {
          ...process.env,
          ...childEnvExtras,
          PARALLEL_BOT: baseBotName,
          // Override bot credentials for clone accounts
          ...(proc.accountName !== baseBotName ? { PARALLEL_BOT_ACCOUNT: proc.accountName } : {}),
        },
        cwd: process.cwd(),
        // shell: false (default) — prevents | in --grep patterns from being
        // interpreted as shell pipes, which would silently drop tests for bots
        // with 2+ tests in their grep pattern.
      });
      spawnedCount++;
      if (spawnedCount % 10 === 0) {
        console.log(`  [Spawn progress] ${spawnedCount}/${processes.length} processes spawned`);
      }
    } catch (err: any) {
      console.error(`  [SPAWN ERROR] ${proc.accountName}: ${err.message}`);
      resolve({ accountName: proc.accountName, testCount: proc.tests.length, exitCode: 1, output: '', duration: 0, passed: 0, failed: 0 });
      return;
    }

    let output = '';
    let hasStarted = false;
    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString();
      output += text;
      // Stream progress
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.includes('passed') || trimmed.includes('failed') || trimmed.includes('timed out')) {
          console.log(`  [${proc.accountName}] ${trimmed}`);
          hasStarted = true;
        }
      }
      // Log first activity (login, test start)
      if (!hasStarted && text.match(/(login|start|running)/i)) {
        console.log(`  [${proc.accountName}] started...`);
        hasStarted = true;
      }
    });
    child.stderr.on('data', (d: Buffer) => { output += d.toString(); });
    child.on('close', (code) => {
      const duration = (Date.now() - t0) / 1000;
      // Parse pass/fail counts from output
      const passMatch = output.match(/(\d+) passed/);
      const failMatch = output.match(/(\d+) failed/);
      const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
      const failed = failMatch ? parseInt(failMatch[1], 10) : 0;

      globalPassed += passed;
      globalFailed += failed;
      completedCount++;

      resolve({ accountName: proc.accountName, testCount: proc.tests.length, exitCode: code || 0, output, duration, passed, failed });
    });
  }));
  }

  // Live progress ticker
  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const remaining = processes.length - completedCount;
    const runRate = completedCount / (parseInt(elapsed) || 1);
    const eta = remaining / (runRate || 1);
    const etaStr = eta > 0 ? ` ETA ${eta.toFixed(0)}s` : '';
    const spawnStr = spawnedCount < processes.length ? ` [spawning ${spawnedCount}/${processes.length}]` : '';

    const testsCompleted = globalPassed + globalFailed;
    const testsRemaining = Math.max(0, totalTests - testsCompleted);

    process.stdout.write(
      `\r  ⏳ ${completedCount}/${processes.length} bots | ` +
      `${testsCompleted}/${totalTests} tests | ` +
      `${globalPassed}P ${globalFailed}F | ${elapsed}s${etaStr}${spawnStr}     `
    );
  }, 10000);

  const results = await Promise.all(promises);
  clearInterval(progressInterval);
  console.log('');

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);

  console.log(`\n${'='.repeat(78)}`);
  console.log(`  PARALLEL RESULTS — ${processes.length} processes, ${elapsed}s wall-clock`);
  console.log(`${'='.repeat(78)}\n`);

  // Sort: all-passed bots first, then by pass rate
  const sorted = results.sort((a, b) => {
    if (a.failed === 0 && b.failed > 0) return -1;
    if (a.failed > 0 && b.failed === 0) return 1;
    return (b.passed / (b.passed + b.failed || 1)) - (a.passed / (a.passed + a.failed || 1));
  });

  for (const r of sorted) {
    const icon = r.failed === 0 ? 'PASS' : 'FAIL';
    const rate = r.passed + r.failed > 0
      ? `${Math.round(100 * r.passed / (r.passed + r.failed))}%`
      : '—';
    console.log(`  ${icon}  ${r.accountName.padEnd(35)} ${String(r.passed).padStart(3)}/${String(r.passed + r.failed).padStart(3)} (${rate.padStart(4)})  ${r.duration.toFixed(0)}s`);
    if (r.failed > 0 && r.exitCode !== 0) {
      // Show last relevant lines
      const lines = r.output.trim().split('\n');
      const failLines = lines.filter(l => l.includes('failed') || l.includes('Error'));
      for (const line of failLines.slice(-3)) {
        console.log(`        ${line.trim().substring(0, 100)}`);
      }
    }
  }

  const seqTime = results.reduce((s, r) => s + r.duration, 0);
  console.log(`\n  Total: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(`  Wall-clock: ${elapsed}s  (sequential would be ~${seqTime.toFixed(0)}s, ${(seqTime / parseFloat(elapsed)).toFixed(1)}x speedup)\n`);

  // ─── Merge per-bot JSON reports for progress report ───────────────────────
  let mergedReportPath: string | null = null;
  try {
    const resultsDir = path.resolve('test-results');
    const botJsonFiles = fs.readdirSync(resultsDir)
      .filter(f => f.match(/^results-.*\.json$/))
      .map(f => path.join(resultsDir, f));

    if (botJsonFiles.length > 0) {
      // Merge all per-bot Playwright JSON reports into a single results.json
      const mergedSuites: any[] = [];
      for (const file of botJsonFiles) {
        try {
          const report = JSON.parse(fs.readFileSync(file, 'utf-8'));
          if (report.suites) mergedSuites.push(...report.suites);
        } catch { /* skip malformed files */ }
      }

      const mergedReport = { suites: mergedSuites };
      mergedReportPath = path.join(resultsDir, 'results.json');
      fs.writeFileSync(mergedReportPath, JSON.stringify(mergedReport, null, 2));
      console.log(`  Merged ${botJsonFiles.length} JSON reports → ${mergedReportPath}`);

      // Clean up per-bot files
      for (const f of botJsonFiles) fs.unlinkSync(f);
    }
  } catch (err: any) {
    console.error('[Merge] Failed:', err.message || err);
  }

  // ─── Delta progress report ─────────────────────────────────────────────────
  if (snapshot && mergedReportPath && fs.existsSync(mergedReportPath)) {
    try {
      printProgressReport(snapshot, mergedReportPath);
    } catch (err: any) {
      console.warn(`[Progress Report] Failed: ${err.message}`);
    }
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
