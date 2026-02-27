import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Custom Playwright reporter that auto-updates the UAT Automation Tracking Sheet
 * after each test run. Runs `scripts/update-tracking-sheet.ts` in onEnd.
 *
 * The JSON reporter writes results.json first, then this reporter reads it
 * and pushes results to the Google Sheet referenced in .tracking-sheet-id.
 */
class TrackingSheetReporter implements Reporter {
  onEnd(result: FullResult): void {
    const scriptPath = path.resolve(__dirname, '../../scripts/update-tracking-sheet.ts');
    const reportPath = path.resolve(__dirname, '../../test-results/results.json');

    console.log('\n[Tracking Sheet] Updating tracking sheet with test results...');

    try {
      execFileSync('npx', ['tsx', scriptPath, '--report', reportPath], {
        cwd: path.resolve(__dirname, '../..'),
        stdio: 'inherit',
        timeout: 60_000,
      });
    } catch (err: any) {
      // Don't fail the test run if tracking sheet update fails
      console.error('[Tracking Sheet] Failed to update tracking sheet:', err.message || err);
    }
  }
}

export default TrackingSheetReporter;
