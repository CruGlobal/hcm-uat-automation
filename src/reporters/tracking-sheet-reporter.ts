import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom Playwright reporter that auto-updates the UAT Automation Tracking Sheet
 * after every test run, regardless of how tests are invoked:
 *   - Serial: `npx playwright test`
 *   - Parallel: `scripts/run-parallel.ts` (each bot process runs this reporter)
 *   - Single test: `npx playwright test --grep "HR-019"`
 *
 * How it works:
 *   1. The JSON reporter (configured before this one) writes results to a JSON file.
 *   2. This reporter's `onEnd()` runs after all tests complete, finds that JSON file,
 *      and calls `scripts/update-tracking-sheet.ts` to push results to Google Sheets.
 *
 * JSON report discovery: Scans `test-results/` for the most recently written
 * `results*.json` file. This handles all naming conventions (results.json,
 * results-bot_hr_admin.json, results-unknown.json) without needing to replicate
 * the JSON reporter's filename logic.
 *
 * IMPORTANT: This reporter MUST be listed AFTER the JSON reporter in the config's
 * reporter array, so the JSON file exists when onEnd() runs.
 *
 * Error resilience: If the sheet update fails (network, auth, missing file), it logs
 * a warning but never fails the test run.
 */
class TrackingSheetReporter implements Reporter {
  private hasTests = false;

  onTestEnd(_test: TestCase, _result: TestResult): void {
    this.hasTests = true;
  }

  onEnd(result: FullResult): void {
    if (!this.hasTests) {
      console.log('\n[Tracking Sheet] No tests ran — skipping sheet update');
      return;
    }

    const projectRoot = path.resolve(__dirname, '../..');
    const scriptPath = path.resolve(projectRoot, 'scripts/update-tracking-sheet.ts');
    const resultsDir = path.resolve(projectRoot, 'test-results');

    // Find the most recently written results*.json file
    const reportPath = this.findLatestReport(resultsDir);
    if (!reportPath) {
      console.log('\n[Tracking Sheet] No results*.json found in test-results/ — skipping sheet update');
      return;
    }

    // Guard: skip if the report is empty or has no test results
    try {
      const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      const hasSuites = reportData.suites && reportData.suites.length > 0;
      if (!hasSuites) {
        console.log('\n[Tracking Sheet] Report has no test suites — skipping sheet update');
        return;
      }
    } catch {
      console.log('\n[Tracking Sheet] Could not parse report file — skipping sheet update');
      return;
    }

    const reportFile = path.basename(reportPath);
    console.log(`\n[Tracking Sheet] Updating tracking sheet from ${reportFile}...`);

    try {
      execFileSync('npx', ['tsx', scriptPath, '--report', reportPath], {
        cwd: projectRoot,
        stdio: 'inherit',
        timeout: 120_000, // 2 min — large runs may have many cell updates
      });
    } catch (err: any) {
      // Never fail the test run due to a sheet update error
      const msg = err.message || String(err);
      // Keep the warning concise — full stack traces are noise here
      const firstLine = msg.split('\n')[0];
      console.error(`[Tracking Sheet] Update failed: ${firstLine}`);
    }
  }

  /**
   * Find the most recently modified results*.json in the given directory.
   * Handles all naming: results.json, results-bot_hr_admin.json, results-unknown.json
   */
  private findLatestReport(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('results') && f.endsWith('.json'));
    if (files.length === 0) return null;

    // Pick the most recently modified
    let latest: string | null = null;
    let latestMtime = 0;
    for (const f of files) {
      const full = path.join(dir, f);
      const mtime = fs.statSync(full).mtimeMs;
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latest = full;
      }
    }
    return latest;
  }
}

export default TrackingSheetReporter;
