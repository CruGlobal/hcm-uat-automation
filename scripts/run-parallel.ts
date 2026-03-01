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
 *   RUN_PASSED_ONLY=true npx tsx scripts/run-parallel.ts   # Only "Passed" tests
 */
import { spawn } from 'child_process';
import { loadUATPlan, isTestable } from '../src/data/uat-plan-provider';
import { getBotForTester, getBotCredentials, getClonesForBot } from '../src/config/bot-users';

// Parse args
const args = process.argv.slice(2);
const maxBots = parseInt(args[args.indexOf('--bots') + 1] || '0', 10) || Infinity;
const moduleFilter = args.includes('--module') ? args[args.indexOf('--module') + 1] : null;
const onePerBot = args.includes('--one-per-bot');
const noClones = args.includes('--no-clones');

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface TestInfo { testId: string; bp: string; module: string }

async function main() {
  // Group testable tests by bot user
  const allTests = loadUATPlan().filter(tc => {
    // Apply base testability (but not PARALLEL_BOT — we're the orchestrator)
    const status = tc.status.toLowerCase();
    if (status === 'deferred' || status === 'cancelled') return false;
    if (!tc.businessProcess && !tc.testScript && !tc.transactionCategory) return false;
    if (process.env.RUN_PASSED_ONLY) {
      if (status !== 'passed' && status !== 'pass') return false;
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
  console.log(`\nParallel run: ${processes.length} processes (${baseBots.length} base bots), ${totalTests} total tests${moduleFilter ? ` (module: ${moduleFilter})` : ''}\n`);
  for (const p of processes) {
    console.log(`  ${p.accountName.padEnd(35)} ${p.tests.length} tests`);
  }
  console.log('');

  const startTime = Date.now();

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

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
