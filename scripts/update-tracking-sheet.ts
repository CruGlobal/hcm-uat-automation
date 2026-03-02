#!/usr/bin/env npx tsx

/**
 * Update the UAT Automation Tracking Sheet with Playwright test results.
 *
 * Reads the Playwright JSON report, extracts test results, and batch-updates
 * the Status, Actual Result, and Tester Name columns in the tracking sheet.
 *
 * Usage:
 *   npx playwright test --reporter=json,list 2>test-results/results.json
 *   npx tsx scripts/update-tracking-sheet.ts
 *
 * Or after a normal run (JSON reporter is configured in playwright.config.ts):
 *   npx tsx scripts/update-tracking-sheet.ts
 *
 * Options:
 *   --report <path>   Path to Playwright JSON report (default: test-results/results.json)
 *   --sheet-id <id>   Tracking sheet ID (default: reads from .tracking-sheet-id)
 *   --dry-run         Print what would be updated without writing to the sheet
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  getAccessToken,
  getSheetTabs,
  readSheetTab,
  batchUpdateCells,
  getTrackingSheetId,
  SHEETS_API,
  type CellUpdate,
} from './lib/google-sheets';

dotenv.config();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TestResult {
  testId: string;
  module: string;
  title: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  errorMessage: string;
}

// ─── Parse Playwright JSON report ────────────────────────────────────────────

export function parsePlaywrightReport(reportPath: string): TestResult[] {
  const raw = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  const results: TestResult[] = [];

  // Playwright JSON report has a nested suites structure
  function walkSuites(suites: any[], parentModule: string = '') {
    for (const suite of suites) {
      // Top-level describe block usually has the module name
      const module = suite.title || parentModule;

      if (suite.specs) {
        for (const spec of suite.specs) {
          const title = spec.title || '';
          const testId = extractTestId(title);

          // Playwright reports multiple test results per spec (retries)
          // Use the last result (final outcome)
          for (const test of spec.tests || []) {
            const lastResult = test.results?.[test.results.length - 1];
            if (!lastResult) continue;

            // test.status is "expected"|"unexpected"|"flaky"|"skipped" (outcome classification)
            // lastResult.status is the actual result: "passed"|"failed"|"timedOut"|"skipped"
            const status = lastResult.status;
            const errorMessage = extractError(lastResult);

            results.push({
              testId,
              module: module.replace(/\s*\(UAT Plan\)/, ''),
              title,
              status,
              duration: lastResult.duration || 0,
              errorMessage,
            });
          }
        }
      }

      // Recurse into nested suites
      if (suite.suites) {
        walkSuites(suite.suites, module);
      }
    }
  }

  walkSuites(raw.suites || []);
  return results;
}

function extractTestId(title: string): string {
  // Test titles look like: "HR-019: Hire Hourly Full Time... — Local HR..."
  const match = title.match(/^([A-Z]{2,}-[\d.]+(?:-\d+)?)/);
  return match ? match[1] : '';
}

function extractError(result: any): string {
  if (!result.errors || result.errors.length === 0) {
    // Check for error in the result itself
    if (result.error?.message) return cleanError(result.error.message);
    return '';
  }

  // Collect all error messages, deduplicated
  const msgs = result.errors
    .map((e: any) => e.message || '')
    .filter(Boolean)
    .map(cleanError);

  return [...new Set(msgs)].join(' | ');
}

function cleanError(msg: string): string {
  // Trim ANSI codes, stack traces, and excessive whitespace
  return msg
    .replace(/\u001b\[\d+m/g, '')
    .replace(/\n\s+at .+/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, 500);
}

// ─── Map results to tracking sheet status ────────────────────────────────────

export function mapStatus(result: TestResult): string {
  switch (result.status) {
    case 'passed':
      return 'Passed';
    case 'failed':
    case 'timedOut':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    case 'interrupted':
      return 'Failed';
    default:
      return 'Not Run';
  }
}

function mapActualResult(result: TestResult): string {
  switch (result.status) {
    case 'passed':
      return `Passed (${(result.duration / 1000).toFixed(1)}s)`;
    case 'failed':
      return result.errorMessage || 'Test failed';
    case 'timedOut':
      return `Timed out after ${(result.duration / 1000).toFixed(0)}s`;
    case 'skipped':
      return result.errorMessage || 'Skipped (deferred/cancelled)';
    case 'interrupted':
      return 'Test run interrupted';
    default:
      return '';
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reportIdx = args.indexOf('--report');
  const sheetIdIdx = args.indexOf('--sheet-id');

  const reportPath = reportIdx >= 0
    ? args[reportIdx + 1]
    : path.resolve(process.cwd(), 'test-results', 'results.json');

  let spreadsheetId = sheetIdIdx >= 0
    ? args[sheetIdIdx + 1]
    : getTrackingSheetId();

  if (!spreadsheetId) {
    console.error('No tracking sheet ID found.');
    console.error('Run create-tracking-sheet.ts first, or pass --sheet-id <id>');
    process.exit(1);
  }

  if (!fs.existsSync(reportPath)) {
    console.error(`Playwright report not found: ${reportPath}`);
    console.error('Run tests first: npx playwright test');
    process.exit(1);
  }

  // Parse report
  console.log(`\nParsing Playwright report: ${reportPath}`);
  const results = parsePlaywrightReport(reportPath);
  console.log(`  Found ${results.length} test results`);

  // Summary
  const counts = { passed: 0, failed: 0, skipped: 0, other: 0 };
  for (const r of results) {
    if (r.status === 'passed') counts.passed++;
    else if (r.status === 'failed' || r.status === 'timedOut') counts.failed++;
    else if (r.status === 'skipped') counts.skipped++;
    else counts.other++;
  }
  console.log(`  Passed: ${counts.passed}, Failed: ${counts.failed}, Skipped: ${counts.skipped}`);

  // Filter out skipped tests — don't update sheet for tests that were skipped
  // (e.g. RUN_PASSED_ONLY filtering, deferred/cancelled tests)
  const activeResults = results.filter(r => r.status !== 'skipped');
  console.log(`  Active (non-skipped): ${activeResults.length}`);

  if (dryRun) {
    console.log('\n--- DRY RUN (no sheet updates) ---\n');
    for (const r of activeResults.filter((r) => r.testId)) {
      console.log(`  ${r.testId}: ${mapStatus(r)} — ${mapActualResult(r).substring(0, 80)}`);
    }
    return;
  }

  // Authenticate
  console.log('\nAuthenticating with Google...');
  const accessToken = await getAccessToken();

  // Get sheet tabs
  const tabs = await getSheetTabs(accessToken, spreadsheetId);
  console.log(`  Tracking sheet has ${tabs.length} tabs: ${tabs.join(', ')}`);

  // Group results by module for efficient tab-level matching
  const resultsByModule = new Map<string, TestResult[]>();
  for (const r of results) {
    if (!r.testId) continue;
    const list = resultsByModule.get(r.module) || [];
    list.push(r);
    resultsByModule.set(r.module, list);
  }

  // Build cell updates
  const cellUpdates: CellUpdate[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const tab of tabs) {
    const moduleResults = resultsByModule.get(tab);
    if (!moduleResults || moduleResults.length === 0) continue;

    console.log(`\nProcessing tab: ${tab} (${moduleResults.length} results)`);

    // Read current sheet data to find row indices
    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    if (rows.length < 2) {
      console.warn(`  Tab "${tab}" is empty, skipping`);
      continue;
    }

    // Build index: testId → row indices (1-based for A1 notation)
    // Multiple rows can have the same testId (duplicate scenarios)
    const rowsByTestId = new Map<string, { rowNum: number; bp: string }[]>();
    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      if (!testId) continue;
      const bp = (rows[i][2] || '').trim(); // Business Process column
      const list = rowsByTestId.get(testId) || [];
      list.push({ rowNum: i + 1, bp }); // +1 for 1-based A1 notation
      rowsByTestId.set(testId, list);
    }

    // Match results to rows — skip tests that were skipped by Playwright
    // (e.g. RUN_PASSED_ONLY filtering, deferred/cancelled tests)
    for (const result of moduleResults) {
      if (result.status === 'skipped') continue; // Don't overwrite sheet with "Skipped"

      const candidates = rowsByTestId.get(result.testId);
      if (!candidates || candidates.length === 0) {
        unmatched++;
        continue;
      }

      // For duplicate testIds, match by business process substring from title
      let targetRow: number;
      if (candidates.length === 1) {
        targetRow = candidates[0].rowNum;
      } else {
        // Extract business process from title: "HR-019: Hire Hourly Full Time... — ..."
        const bpMatch = result.title.match(/^[^:]+:\s*(.+?)(?:\s*—|$)/);
        const bpFragment = bpMatch ? bpMatch[1].trim() : '';

        const match = candidates.find((c) =>
          c.bp.substring(0, 50).toLowerCase() === bpFragment.substring(0, 50).toLowerCase(),
        );
        targetRow = match ? match.rowNum : candidates[0].rowNum;
      }

      const status = mapStatus(result);
      const actualResult = mapActualResult(result);
      const safeTab = tab.replace(/'/g, "''");

      // Column J = Status, K = Actual Result, L = Tester Name
      cellUpdates.push({ range: `'${safeTab}'!J${targetRow}`, value: status });
      cellUpdates.push({ range: `'${safeTab}'!K${targetRow}`, value: actualResult });
      cellUpdates.push({ range: `'${safeTab}'!L${targetRow}`, value: 'Automation' });

      matched++;
    }

    console.log(`  Matched: ${matched} (this tab)`);
  }

  console.log(`\nTotal matched: ${matched}, unmatched: ${unmatched}`);
  console.log(`Cell updates to write: ${cellUpdates.length}`);

  if (cellUpdates.length === 0) {
    console.log('No updates to write.');
    return;
  }

  // Write updates
  console.log('\nUpdating tracking sheet...');
  await batchUpdateCells(accessToken, spreadsheetId, cellUpdates);
  console.log('  Done.');

  // Update "Last Updated" timestamp in Summary tab (if it exists)
  if (tabs.includes('Summary')) {
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    await batchUpdateCells(accessToken, spreadsheetId, [
      { range: "'Summary'!B2", value: timestamp },
    ]);
    console.log(`  Summary tab timestamp updated: ${timestamp}`);
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log(`\n================================================`);
  console.log(`  Updated ${matched} tests in tracking sheet`);
  console.log(`  Passed: ${counts.passed}, Failed: ${counts.failed}, Skipped: ${counts.skipped}`);
  console.log(`  ${url}`);
  console.log('================================================\n');
}

// Only auto-run when executed directly (not when imported)
const isDirectRun = process.argv[1]?.includes('update-tracking-sheet');
if (isDirectRun) {
  main().catch((err) => {
    console.error('\nError:', err.message);
    process.exit(1);
  });
}
