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

// Parse args
const args = process.argv.slice(2);
const maxBots = parseInt(args[args.indexOf('--bots') + 1] || '0', 10) || Infinity;
const moduleFilter = args.includes('--module') ? args[args.indexOf('--module') + 1] : null;
const onePerBot = args.includes('--one-per-bot');
const noClones = args.includes('--no-clones');
const statusFilter = args.includes('--status') ? args[args.indexOf('--status') + 1] : null;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface TestInfo { testId: string; bp: string; module: string }

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
        byTestId.set(testId, status);
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

async function main() {
  // Parse --status filter
  const statusFilterValues = statusFilter
    ? statusFilter.split(',').map(s => s.trim().toLowerCase())
    : null;

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
    return true;
  });

  const botTests = new Map<string, TestInfo[]>();

  for (const tc of allTests) {
    const bot = getBotForTester(tc.testerName, tc.module || tc.tabName);
    if (!getBotCredentials(bot.botName)) continue;
    const tests = botTests.get(bot.botName) || [];
    tests.push({ testId: tc.testId, bp: tc.businessProcess, module: tc.module || tc.tabName });
    botTests.set(bot.botName, tests);
  }

  // Build process list — distribute tests across base bots + clones
  type ProcessEntry = { accountName: string; tests: TestInfo[] };
  const processes: ProcessEntry[] = [];

  const baseBots = [...botTests.entries()]
    .sort((a, b) => b[1].length - a[1].length) // largest first
    .slice(0, maxBots);

  for (const [baseBotName, tests] of baseBots) {
    if (noClones) {
      // No clone distribution — one process per base bot (original behavior)
      processes.push({ accountName: baseBotName, tests });
      continue;
    }

    // Find clones for this base bot
    const cloneNames = getClonesForBot(baseBotName);
    if (cloneNames.length === 0) {
      // No clones — run all tests under the base bot
      processes.push({ accountName: baseBotName, tests });
      continue;
    }

    // Distribute tests round-robin across base + clones
    const accounts = [baseBotName, ...cloneNames];
    const buckets: TestInfo[][] = accounts.map(() => []);
    for (let i = 0; i < tests.length; i++) {
      buckets[i % accounts.length].push(tests[i]);
    }

    for (let i = 0; i < accounts.length; i++) {
      if (buckets[i].length > 0) {
        processes.push({ accountName: accounts[i], tests: buckets[i] });
      }
    }
  }

  if (processes.length === 0) {
    console.log('No testable tests found for any bot user.');
    console.log('Ensure .cache/uat-plan.json exists and .config/bot-credentials.json has credentials.');
    process.exit(1);
  }

  const totalTests = processes.reduce((sum, p) => sum + p.tests.length, 0);
  const filters = [
    moduleFilter ? `module: ${moduleFilter}` : '',
    statusFilter ? `status: ${statusFilter}` : '',
    process.env.RUN_PASSED_ONLY ? 'passed-only' : '',
    process.env.RUN_FAILED_ONLY ? 'failed-only' : '',
  ].filter(Boolean).join(', ');
  console.log(`\nParallel run: ${processes.length} processes (${baseBots.length} base bots), ${totalTests} total tests${filters ? ` (${filters})` : ''}\n`);
  for (const p of processes) {
    console.log(`  ${p.accountName.padEnd(35)} ${p.tests.length} tests`);
  }
  console.log('');

  // ─── Snapshot tracking sheet before the run ──────────────────────────────────
  const snapshot = await captureSnapshot();

  const startTime = Date.now();

  // Build env vars for child processes
  const childEnvExtras: Record<string, string> = {};
  if (statusFilterValues) {
    childEnvExtras.RUN_STATUS_FILTER = statusFilterValues.join(',');
  }

  // Spawn all processes in parallel
  const promises = processes.map((proc) => new Promise<{
    accountName: string; testCount: number; exitCode: number; output: string; duration: number;
    passed: number; failed: number;
  }>((resolve) => {
    const t0 = Date.now();

    // For clone accounts, PARALLEL_BOT is still the BASE bot name so isTestable()
    // picks up the right tests. The clone account is only used for login credentials.
    const baseBotName = proc.accountName.replace(/_\d+$/, '');

    // Build args
    const playwrightArgs = [
      'playwright', 'test',
      '--config', 'playwright.parallel.config.ts',
    ];

    if (onePerBot) {
      // Smoke test mode: one test per bot via --grep
      const grepPattern = `${escapeRegex(proc.tests[0].testId)}: `;
      playwrightArgs.push('--grep', grepPattern);
    } else if (proc.accountName !== baseBotName) {
      // Clone account: filter to specific test IDs via --grep
      const grepPattern = proc.tests.map(t => escapeRegex(t.testId)).join('|');
      playwrightArgs.push('--grep', grepPattern);
    }

    const child = spawn('npx', playwrightArgs, {
      env: {
        ...process.env,
        ...childEnvExtras,
        PARALLEL_BOT: baseBotName,
        // Override bot credentials for clone accounts
        ...(proc.accountName !== baseBotName ? { PARALLEL_BOT_ACCOUNT: proc.accountName } : {}),
      },
      cwd: process.cwd(),
      shell: true,
    });

    let output = '';
    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString();
      output += text;
      // Stream progress
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.includes('passed') || trimmed.includes('failed') || trimmed.includes('timed out')) {
          console.log(`  [${proc.accountName}] ${trimmed}`);
        }
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
      resolve({ accountName: proc.accountName, testCount: proc.tests.length, exitCode: code || 0, output, duration, passed, failed });
    });
  }));

  const results = await Promise.all(promises);

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

  // ─── Merge per-bot JSON reports and update tracking sheet ──────────────────
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

      // Run tracking sheet updater
      console.log('\n[Tracking Sheet] Updating tracking sheet with test results...');
      execFileSync('npx', ['tsx', 'scripts/update-tracking-sheet.ts', '--report', mergedReportPath], {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: 60_000,
      });
    } else {
      console.log('  No per-bot JSON reports found — tracking sheet not updated');
    }
  } catch (err: any) {
    console.error('[Tracking Sheet] Failed to update:', err.message || err);
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
