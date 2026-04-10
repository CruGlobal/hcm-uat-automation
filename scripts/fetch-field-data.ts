#!/usr/bin/env npx tsx
/**
 * Fetch field-level test data from the UAT Test Data (Migration) Google Sheet
 * and write it to .cache-generated/field-data.json.
 *
 * This is an alternative to generate-test-data.ts (which requires Oracle DB access).
 * The Google Sheet has the same data in transposed layout:
 *   - Column A: Field labels (section headers + field names)
 *   - Column B: Descriptions (ignored)
 *   - Columns C+: One test case per column
 *
 * Usage:
 *   npx tsx scripts/fetch-field-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const SHEET_ID = '1zhX-jtQnBieWCo6OIv7bx2hlIAQg85l55kfzvn6qwUk';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const OUTPUT_FILE = path.resolve(process.cwd(), '.cache-generated', 'field-data.json');

interface TestCase {
  testId: string;
  tab: string;
  scenario: string;
  fields: Record<string, string>;
  columnIndex: number;
}

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

async function getSheetTabs(token: string): Promise<string[]> {
  const res = await fetch(`${SHEETS_API}/${SHEET_ID}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get tabs: ${res.status}`);
  const data = await res.json();
  return data.sheets.map((s: any) => s.properties.title);
}

async function fetchTab(token: string, tabName: string): Promise<string[][]> {
  const range = encodeURIComponent(`'${tabName}'`);
  const url = `${SHEETS_API}/${SHEET_ID}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { console.warn(`  Skipping tab "${tabName}": ${res.status}`); return []; }
  const body = await res.json();
  return (body.values || []).map((row: any[]) =>
    row.map((c: any) => (c == null ? '' : String(c).trim()))
  );
}

function parseTab(tabName: string, rows: string[][]): TestCase[] {
  if (rows.length < 2) return [];

  // Find the "TestCase" row — this has the test IDs in columns C+
  const testCaseRowIdx = rows.findIndex(r => (r[0] || '').trim() === 'TestCase');
  if (testCaseRowIdx === -1) {
    console.warn(`  No "TestCase" row found in tab "${tabName}", skipping`);
    return [];
  }

  const testCaseRow = rows[testCaseRowIdx];
  const scenarioRow = rows[testCaseRowIdx + 1] || [];

  // Build list of test case columns (index → testId)
  const testCols: { colIdx: number; testId: string; scenario: string }[] = [];
  for (let c = 2; c < testCaseRow.length; c++) {
    const testId = testCaseRow[c]?.trim();
    if (testId && testId !== '') {
      testCols.push({ colIdx: c, testId, scenario: scenarioRow[c] || '' });
    }
  }

  if (testCols.length === 0) return [];

  // Parse field rows — rows below testCaseRow+1
  // Track current section header
  let currentSection = '';
  const fieldRows: { compositeKey: string; rowIdx: number }[] = [];

  for (let r = testCaseRowIdx + 2; r < rows.length; r++) {
    const label = (rows[r][0] || '').trim();
    if (!label) continue;

    // Detect section headers: col B is empty and no test case columns have values
    // OR the label matches known section header patterns (no test data in that row)
    const hasAnyValue = testCols.some(tc => (rows[r][tc.colIdx] || '').trim() !== '');
    if (!hasAnyValue) {
      // This is a section header row
      currentSection = label;
      continue;
    }

    const compositeKey = currentSection ? `${currentSection} > ${label}` : label;
    fieldRows.push({ compositeKey, rowIdx: r });
  }

  // Build one TestCase per column
  const cases: TestCase[] = [];
  for (const { colIdx, testId, scenario } of testCols) {
    const fields: Record<string, string> = {};
    for (const { compositeKey, rowIdx } of fieldRows) {
      const value = (rows[rowIdx][colIdx] || '').trim();
      if (value) fields[compositeKey] = value;
    }
    cases.push({ testId, tab: tabName, scenario, fields, columnIndex: colIdx });
  }

  return cases;
}

async function main() {
  console.log('Fetching UAT Test Data sheet...');
  const token = await getAccessToken();

  console.log('Getting sheet tabs...');
  const tabs = await getSheetTabs(token);
  console.log(`Found ${tabs.length} tabs: ${tabs.join(', ')}`);

  const allCases: TestCase[] = [];

  for (const tab of tabs) {
    console.log(`\nFetching tab: ${tab}`);
    const rows = await fetchTab(token, tab);
    if (rows.length === 0) continue;
    const cases = parseTab(tab, rows);
    console.log(`  ${cases.length} test cases parsed`);
    allCases.push(...cases);
  }

  // Build output: { [testId]: TestCase }
  const output: Record<string, TestCase> = {};
  for (const tc of allCases) {
    if (output[tc.testId]) {
      console.warn(`  Duplicate testId ${tc.testId} — keeping first (tab: ${output[tc.testId].tab})`);
    } else {
      output[tc.testId] = tc;
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n=== Total: ${Object.keys(output).length} test cases with field data ===`);
  console.log(`Written to: ${OUTPUT_FILE}`);

  // Summary by tab
  const byTab = new Map<string, number>();
  for (const tc of allCases) {
    byTab.set(tc.tab, (byTab.get(tc.tab) || 0) + 1);
  }
  console.log('\nBy tab:');
  for (const [tab, count] of byTab.entries()) {
    console.log(`  ${tab}: ${count}`);
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
