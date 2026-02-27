#!/usr/bin/env npx tsx
/**
 * Fetch the UAT Plan spreadsheet (separate from the test data sheet).
 *
 * The UAT Plan has ~1200 test cases across multiple tabs in a NORMAL layout
 * (one row per test case, not transposed like the test data sheet).
 *
 * Columns: Test ID, Module, Business Process, Test Scenario, Transaction Category,
 *          Test Script (Link), Pre-Conditions, Test Data, Expected Result, Status, etc.
 *
 * Output: .cache/uat-plan.json — array of all test cases from all tabs
 *
 * Usage:
 *   npx tsx scripts/fetch-uat-plan.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const UAT_PLAN_SHEET_ID = '13EQVOBPwGWnQ3TEkMU52mPS88uViDhwO-TgY88sLguY';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OUTPUT_FILE = path.resolve(process.cwd(), '.cache', 'uat-plan.json');

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

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials in .env');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

/** Get all sheet/tab names from the spreadsheet metadata. */
async function getSheetNames(accessToken: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${UAT_PLAN_SHEET_ID}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to get sheet metadata: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return (data.sheets || []).map((s: any) => s.properties.title);
}

/** Fetch a single tab's data. */
async function fetchTab(tabName: string, accessToken: string): Promise<string[][]> {
  const range = encodeURIComponent(`'${tabName}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${UAT_PLAN_SHEET_ID}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`  Failed to fetch tab "${tabName}": ${res.status}`);
    return [];
  }
  const body = await res.json();
  return (body.values || []).map((row: any[]) =>
    row.map((cell) => (cell == null ? '' : String(cell).trim()))
  );
}

/** Parse a tab's rows into UATTestCase objects. */
function parseTab(tabName: string, rows: string[][]): UATTestCase[] {
  if (rows.length < 2) return [];

  // Find header row (contains "Test ID" in first column)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const cell = (rows[i][0] || '').toLowerCase();
    if (cell.includes('test id') || cell === 'test id') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    console.warn(`  No "Test ID" header found in tab "${tabName}", skipping`);
    return [];
  }

  const headers = rows[headerIdx].map(h => h.toLowerCase().trim());

  // Map column indices
  const col = (name: string): number => {
    const idx = headers.findIndex(h => h.includes(name));
    return idx >= 0 ? idx : -1;
  };

  const testIdCol = col('test id');
  const moduleCol = col('module');
  const bpCol = col('business process');
  const scenarioCol = col('test scenario');
  const categoryCol = col('transaction category');
  const scriptCol = col('test script');
  const preCondCol = col('pre-condition');
  const dataCol = col('test data');
  const expectedCol = col('expected result');
  const statusCol = col('status');
  const actualCol = col('actual result');
  const testerCol = col('tester name');
  const alithyaCol = col('alithya');
  const commentsCol = col('comment');
  const weekCol = col('test week');
  const dateCol = col('test date');

  if (testIdCol === -1) {
    console.warn(`  "Test ID" column not found in tab "${tabName}"`);
    return [];
  }

  const cases: UATTestCase[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const testId = (row[testIdCol] || '').trim();
    if (!testId) continue; // Skip empty rows

    // Infer module from tab name when the module column is empty
    const rawModule = moduleCol >= 0 ? (row[moduleCol] || '') : '';
    const TAB_MODULE: Record<string, string> = {
      'Core HR': 'Core HR', 'Payroll': 'Payroll',
      'Absence Management': 'Absence Management', 'Benefits': 'Benefits',
      'Time and Labor': 'Time and Labor', 'Journeys': 'Journeys',
      'Workforce Compensation': 'Workforce Compensation', 'MPDX': 'MPDX',
      'OneApp': 'OneApp', 'SAA': 'SAA', 'Other Functions': 'Other Functions',
    };
    const inferredModule = rawModule || TAB_MODULE[tabName] || '';

    cases.push({
      testId,
      module: inferredModule,
      businessProcess: bpCol >= 0 ? (row[bpCol] || '') : '',
      testScenario: scenarioCol >= 0 ? (row[scenarioCol] || '') : '',
      transactionCategory: categoryCol >= 0 ? (row[categoryCol] || '') : '',
      testScript: scriptCol >= 0 ? (row[scriptCol] || '') : '',
      preConditions: preCondCol >= 0 ? (row[preCondCol] || '') : '',
      testData: dataCol >= 0 ? (row[dataCol] || '') : '',
      expectedResult: expectedCol >= 0 ? (row[expectedCol] || '') : '',
      status: statusCol >= 0 ? (row[statusCol] || '') : '',
      actualResult: actualCol >= 0 ? (row[actualCol] || '') : '',
      testerName: testerCol >= 0 ? (row[testerCol] || '') : '',
      alithyaContact: alithyaCol >= 0 ? (row[alithyaCol] || '') : '',
      comments: commentsCol >= 0 ? (row[commentsCol] || '') : '',
      testWeek: weekCol >= 0 ? (row[weekCol] || '') : '',
      testDate: dateCol >= 0 ? (row[dateCol] || '') : '',
      tabName,
    });
  }

  return cases;
}

async function main() {
  console.log('Fetching UAT Plan spreadsheet...');
  const accessToken = await getAccessToken();

  console.log('Getting sheet names...');
  const sheetNames = await getSheetNames(accessToken);
  console.log(`Found ${sheetNames.length} tabs: ${sheetNames.join(', ')}`);

  const allCases: UATTestCase[] = [];

  for (const tabName of sheetNames) {
    console.log(`\nFetching tab: ${tabName}`);
    const rows = await fetchTab(tabName, accessToken);
    console.log(`  ${rows.length} rows`);

    const cases = parseTab(tabName, rows);
    console.log(`  ${cases.length} test cases parsed`);
    allCases.push(...cases);
  }

  // Write output
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allCases, null, 2));
  console.log(`\n=== Total: ${allCases.length} UAT test cases ===`);
  console.log(`Written to: ${OUTPUT_FILE}`);

  // Summary by module
  const byModule = new Map<string, number>();
  for (const tc of allCases) {
    const mod = tc.module || 'Unknown';
    byModule.set(mod, (byModule.get(mod) || 0) + 1);
  }
  console.log('\nBy module:');
  for (const [mod, count] of [...byModule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${mod}: ${count}`);
  }

  // Summary by status
  const byStatus = new Map<string, number>();
  for (const tc of allCases) {
    const st = tc.status || 'No Status';
    byStatus.set(st, (byStatus.get(st) || 0) + 1);
  }
  console.log('\nBy status:');
  for (const [st, count] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${st}: ${count}`);
  }

  // Summary by test script
  const byScript = new Map<string, number>();
  for (const tc of allCases) {
    const script = tc.testScript || 'No Script';
    byScript.set(script, (byScript.get(script) || 0) + 1);
  }
  console.log('\nBy test script (top 20):');
  for (const [script, count] of [...byScript.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${script}: ${count}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
