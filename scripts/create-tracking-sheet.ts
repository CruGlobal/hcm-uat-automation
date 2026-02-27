#!/usr/bin/env npx tsx

/**
 * Create a NEW Google Sheet that clones the UAT Plan format for tracking
 * automation test results.
 *
 * Layout matches the UAT Plan: one tab per module, one row per test case.
 * Columns: Test ID, Module, Business Process, Test Scenario, Transaction Category,
 *          Test Script, Pre-Conditions, Test Data, Expected Result, Status,
 *          Actual Result, Tester Name, Alithya Contact, Comments, Test Week, Test Date
 *
 * Status and Actual Result start blank — filled by update-tracking-sheet.ts after test runs.
 *
 * Usage:
 *   npx tsx scripts/create-tracking-sheet.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const ID_FILE = path.resolve(process.cwd(), '.tracking-sheet-id');

interface UATTestCase {
  testId: string;
  module: string;
  businessProcess: string;
  testScenario: string;
  transactionCategory: string;
  testScript: string;
  preConditions: string;
  testData: string;
  expectedResult: string;
  status: string;
  actualResult: string;
  testerName: string;
  alithyaContact: string;
  comments: string;
  testWeek: string;
  testDate: string;
  tabName: string;
}

const SKIP_TABS = new Set(['UAT_DATA', 'Instructions and Index', 'Sample Scenarios']);

const COLUMNS = [
  'Test ID',
  'Module',
  'Business Process',
  'Test Scenario',
  'Transaction Category',
  'Test Script',
  'Pre-Conditions',
  'Test Data',
  'Expected Result',
  'Status',
  'Actual Result',
  'Tester Name',
  'Alithya Contact',
  'Comments',
  'Test Week',
  'Test Date',
];

/** Module tab ordering (matches the UAT Plan). */
const TAB_ORDER = [
  'Core HR',
  'Payroll',
  'Absence Management',
  'Benefits',
  'Time and Labor',
  'Journeys',
  'Workforce Compensation',
  'MPDX',
  'OneApp',
  'SAA',
  'Other Functions',
];

// ─── Auth ────────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

// ─── Data loading ────────────────────────────────────────────────────────────

function loadTestCases(): Map<string, UATTestCase[]> {
  const cachePath = path.resolve(process.cwd(), '.cache', 'uat-plan.json');
  if (!fs.existsSync(cachePath)) {
    throw new Error(`UAT Plan cache not found at ${cachePath}. Run: npx tsx scripts/fetch-uat-plan.ts`);
  }

  const all: UATTestCase[] = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

  // Filter same as spec files: skip meta tabs, keep valid test IDs
  const tests = all.filter(
    (tc) => !SKIP_TABS.has(tc.tabName) && tc.testId.match(/^[A-Z]{2,}-\d/),
  );

  // Group by module (infer from tabName if module is empty)
  const byModule = new Map<string, UATTestCase[]>();
  for (const tc of tests) {
    const mod = tc.module || tc.tabName;
    if (!mod) continue;
    const list = byModule.get(mod) || [];
    list.push(tc);
    byModule.set(mod, list);
  }

  return byModule;
}

function testCaseToRow(tc: UATTestCase): string[] {
  return [
    tc.testId,
    tc.module || tc.tabName,
    tc.businessProcess,
    tc.testScenario,
    tc.transactionCategory,
    tc.testScript,
    tc.preConditions,
    tc.testData,
    tc.expectedResult,
    '', // Status — blank, filled by automation
    '', // Actual Result — blank, filled by automation
    '', // Tester Name — blank, filled by automation
    tc.alithyaContact,
    tc.comments,
    tc.testWeek,
    tc.testDate,
  ];
}

// ─── Google Sheets API ───────────────────────────────────────────────────────

async function createSpreadsheet(
  accessToken: string,
  title: string,
  tabNames: string[],
): Promise<{ spreadsheetId: string; sheetIds: Map<string, number> }> {
  const res = await fetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: tabNames.map((name) => ({
        properties: { title: name },
      })),
    }),
  });

  if (!res.ok) throw new Error(`Create spreadsheet failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  const sheetIds = new Map<string, number>();
  for (const sheet of data.sheets) {
    sheetIds.set(sheet.properties.title, sheet.properties.sheetId);
  }

  return { spreadsheetId: data.spreadsheetId, sheetIds };
}

async function writeTabData(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  grid: string[][],
): Promise<void> {
  const range = `'${tabName}'`;
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: grid }),
  });

  if (!res.ok) throw new Error(`Write to "${tabName}" failed: ${res.status} ${await res.text()}`);
}

async function applyFormatting(
  accessToken: string,
  spreadsheetId: string,
  sheetIds: Map<string, number>,
  tabRowCounts: Map<string, number>,
): Promise<void> {
  const requests: any[] = [];

  for (const [tabName, rowCount] of tabRowCounts) {
    const sheetId = sheetIds.get(tabName);
    if (sheetId == null) continue;

    const numCols = COLUMNS.length;

    // Freeze header row and Test ID column
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 },
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    });

    // Bold header row with dark background
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: numCols,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            backgroundColor: { red: 0.2, green: 0.33, blue: 0.53 },
            horizontalAlignment: 'CENTER',
          },
        },
        fields:
          'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor,' +
          'userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment',
      },
    });

    // Alternating row colors for data rows
    requests.push({
      addBanding: {
        bandedRange: {
          sheetId,
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: numCols,
          },
          rowProperties: {
            headerColor: { red: 0.2, green: 0.33, blue: 0.53 },
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: { red: 0.93, green: 0.95, blue: 0.98 },
          },
        },
      },
    });

    // Column widths
    const colWidths: [number, number, number][] = [
      [0, 1, 90],    // Test ID
      [1, 2, 110],   // Module
      [2, 3, 300],   // Business Process
      [3, 4, 300],   // Test Scenario
      [4, 5, 140],   // Transaction Category
      [5, 6, 120],   // Test Script
      [6, 7, 250],   // Pre-Conditions
      [7, 8, 110],   // Test Data
      [8, 9, 300],   // Expected Result
      [9, 10, 100],  // Status
      [10, 11, 250], // Actual Result
      [11, 12, 130], // Tester Name
      [12, 13, 130], // Alithya Contact
      [13, 14, 250], // Comments
      [14, 15, 150], // Test Week
      [15, 16, 100], // Test Date
    ];

    for (const [start, end, px] of colWidths) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: start, endIndex: end },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    }

    // Wrap text in long columns
    for (const col of [2, 3, 6, 8, 10, 13]) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: col,
            endColumnIndex: col + 1,
          },
          cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
          fields: 'userEnteredFormat.wrapStrategy',
        },
      });
    }

    // Data validation dropdown for Status column (col 9)
    requests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount,
          startColumnIndex: 9,
          endColumnIndex: 10,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: 'Passed' },
              { userEnteredValue: 'Failed' },
              { userEnteredValue: 'Skipped' },
              { userEnteredValue: 'In Progress' },
              { userEnteredValue: 'Not Run' },
              { userEnteredValue: 'Blocked' },
            ],
          },
          showCustomUi: true,
          strict: false,
        },
      },
    });

    // Conditional formatting: green for Passed, red for Failed, yellow for Skipped
    const statusFormats: [string, { red: number; green: number; blue: number }][] = [
      ['Passed', { red: 0.72, green: 0.88, blue: 0.72 }],
      ['Failed', { red: 0.96, green: 0.7, blue: 0.7 }],
      ['Skipped', { red: 1, green: 0.95, blue: 0.7 }],
      ['In Progress', { red: 0.78, green: 0.86, blue: 0.95 }],
    ];

    for (const [val, bg] of statusFormats) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                endRowIndex: rowCount,
                startColumnIndex: 0,
                endColumnIndex: numCols,
              },
            ],
            booleanRule: {
              condition: {
                type: 'CUSTOM_FORMULA',
                values: [{ userEnteredValue: `=$J2="${val}"` }],
              },
              format: { backgroundColor: bg },
            },
          },
          index: 0,
        },
      });
    }

    // Auto-filter on header row
    requests.push({
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: numCols,
          },
        },
      },
    });
  }

  if (requests.length === 0) return;

  // Batch in chunks to stay under API limits
  for (let i = 0; i < requests.length; i += 100) {
    const chunk = requests.slice(i, i + 100);
    const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: chunk }),
    });
    if (!res.ok) {
      console.warn(`  Warning: formatting batch ${Math.floor(i / 100) + 1} failed: ${res.status}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nLoading UAT Plan from cache...');
  const byModule = loadTestCases();

  // Order tabs
  const tabNames = TAB_ORDER.filter((t) => byModule.has(t));
  for (const t of byModule.keys()) {
    if (!tabNames.includes(t)) tabNames.push(t);
  }

  let total = 0;
  for (const tab of tabNames) {
    const count = byModule.get(tab)!.length;
    total += count;
    console.log(`  ${tab}: ${count} tests`);
  }
  console.log(`  Total: ${total} tests`);

  // Build grids
  const tabGrids = new Map<string, string[][]>();
  const tabRowCounts = new Map<string, number>();
  for (const tab of tabNames) {
    const cases = byModule.get(tab)!;
    const grid = [COLUMNS, ...cases.map(testCaseToRow)];
    tabGrids.set(tab, grid);
    tabRowCounts.set(tab, grid.length);
  }

  // Authenticate
  console.log('\nAuthenticating with Google...');
  const accessToken = await getAccessToken();

  // Create spreadsheet
  const today = new Date().toISOString().split('T')[0];
  const title = `UAT Automation Tracking - ${today}`;
  console.log(`\nCreating spreadsheet: "${title}"...`);
  const { spreadsheetId, sheetIds } = await createSpreadsheet(accessToken, title, tabNames);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log(`  Created: ${url}`);

  // Write data
  console.log('\nWriting test data...');
  for (const tab of tabNames) {
    const grid = tabGrids.get(tab)!;
    await writeTabData(accessToken, spreadsheetId, tab, grid);
    console.log(`  ${tab}: ${grid.length - 1} tests`);
  }

  // Apply formatting
  console.log('\nApplying formatting (headers, colors, filters, dropdowns)...');
  await applyFormatting(accessToken, spreadsheetId, sheetIds, tabRowCounts);
  console.log('  Done.');

  // Save sheet ID for update-tracking-sheet.ts
  fs.writeFileSync(ID_FILE, spreadsheetId);
  console.log(`\nTracking sheet ID saved to: ${ID_FILE}`);

  console.log('\n================================================');
  console.log(`  UAT Automation Tracking Sheet`);
  console.log(`  ${total} tests across ${tabNames.length} modules`);
  console.log(`  Status: blank (run tests, then update with update-tracking-sheet.ts)`);
  console.log(`  ${url}`);
  console.log('================================================\n');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
