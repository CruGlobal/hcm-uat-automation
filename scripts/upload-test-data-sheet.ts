#!/usr/bin/env npx tsx

/**
 * Upload generated test data to a Google Sheet matching the UAT Test Data format.
 *
 * By default, updates the existing sheet in-place (clearing old tabs, adding new
 * ones). Pass --new to create a brand-new spreadsheet instead.
 *
 * Uses the same transposed layout as the original UAT Test Data sheet:
 *   - Column A: Field labels (with section headers as separate rows)
 *   - Column B: (reserved for descriptions — left blank for generated data)
 *   - Columns C+: One test case per column
 *
 * Usage:
 *   npx tsx scripts/upload-test-data-sheet.ts              # Update existing sheet
 *   npx tsx scripts/upload-test-data-sheet.ts --new        # Create new sheet
 *   npx tsx scripts/upload-test-data-sheet.ts --sheet-id <id>  # Use a specific sheet
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Default sheet ID — the existing UAT Test Data (Migration) sheet. */
const DEFAULT_SHEET_ID = '1zhX-jtQnBieWCo6OIv7bx2hlIAQg85l55kfzvn6qwUk';

interface TestCase {
  testId: string;
  tab: string;
  scenario: string;
  fields: Record<string, string>;
  columnIndex: number;
}

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
  if (!res.ok) throw new Error(`OAuth token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

// ─── Field key parsing ───────────────────────────────────────────────────────

/** Parse "Section > Field" composite key into [section, fieldName]. */
function parseFieldKey(key: string): [string, string] {
  const idx = key.indexOf(' > ');
  if (idx === -1) return ['', key];
  return [key.slice(0, idx), key.slice(idx + 3)];
}

/** Build ordered field rows for a tab, inserting section header rows. */
function buildFieldRows(
  testCases: TestCase[],
): { isHeader: boolean; label: string; compositeKey: string }[] {
  const seen = new Set<string>();
  const orderedKeys: string[] = [];
  for (const tc of testCases) {
    for (const key of Object.keys(tc.fields)) {
      if (!seen.has(key)) {
        seen.add(key);
        orderedKeys.push(key);
      }
    }
  }

  const rows: { isHeader: boolean; label: string; compositeKey: string }[] = [];
  let currentSection = '';

  for (const key of orderedKeys) {
    const [section, fieldName] = parseFieldKey(key);
    if (section && section !== currentSection) {
      rows.push({ isHeader: true, label: section, compositeKey: '' });
      currentSection = section;
    }
    rows.push({
      isHeader: false,
      label: section ? fieldName : key,
      compositeKey: key,
    });
  }

  return rows;
}

// ─── Grid construction ───────────────────────────────────────────────────────

/** Build the transposed grid for one tab. */
function buildGrid(testCases: TestCase[]): string[][] {
  const fieldRows = buildFieldRows(testCases);
  const grid: string[][] = [];

  grid.push(['TestCase', '', ...testCases.map((tc) => tc.testId)]);
  grid.push(['', 'Scenario', ...testCases.map((tc) => tc.scenario)]);

  for (const row of fieldRows) {
    if (row.isHeader) {
      grid.push([row.label, '', ...testCases.map(() => '')]);
    } else {
      grid.push([row.label, '', ...testCases.map((tc) => String(tc.fields[row.compositeKey] ?? ''))]);
    }
  }

  return grid;
}

// ─── Google Sheets API calls ─────────────────────────────────────────────────

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

/** Get existing tab names and sheetIds from a spreadsheet. */
async function getExistingTabs(
  accessToken: string,
  spreadsheetId: string,
): Promise<Map<string, number>> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(title,sheetId)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Get tabs failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  const tabs = new Map<string, number>();
  for (const sheet of data.sheets) {
    tabs.set(sheet.properties.title, sheet.properties.sheetId);
  }
  return tabs;
}

/**
 * Sync tabs on an existing spreadsheet: add missing tabs, remove stale tabs,
 * clear data on tabs that will be rewritten.
 */
async function syncTabs(
  accessToken: string,
  spreadsheetId: string,
  wantedTabs: string[],
  existingTabs: Map<string, number>,
): Promise<Map<string, number>> {
  const requests: any[] = [];
  const wantedSet = new Set(wantedTabs);

  // Delete tabs that are no longer needed
  for (const [name, sheetId] of existingTabs) {
    if (!wantedSet.has(name)) {
      requests.push({ deleteSheet: { sheetId } });
    }
  }

  // Add tabs that don't exist yet
  for (const name of wantedTabs) {
    if (!existingTabs.has(name)) {
      requests.push({ addSheet: { properties: { title: name } } });
    }
  }

  if (requests.length > 0) {
    const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
    if (!res.ok) throw new Error(`Sync tabs failed: ${res.status} ${await res.text()}`);
  }

  // Re-fetch tabs to get the final sheetIds (new tabs get new IDs)
  return getExistingTabs(accessToken, spreadsheetId);
}

/** Clear all data from a tab. */
async function clearTab(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<void> {
  const range = encodeURIComponent(`'${tabName}'`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}:clear`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`  Warning: clear "${tabName}" failed: ${res.status}`);
  }
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
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: grid,
    }),
  });

  if (!res.ok) throw new Error(`Write to "${tabName}" failed: ${res.status} ${await res.text()}`);
}

/** Apply formatting: freeze panes, bold headers, section header styling, column widths. */
async function applyFormatting(
  accessToken: string,
  spreadsheetId: string,
  sheetIds: Map<string, number>,
  tabGrids: Map<string, string[][]>,
): Promise<void> {
  const requests: any[] = [];

  for (const [tabName, grid] of tabGrids) {
    const sheetId = sheetIds.get(tabName);
    if (sheetId == null) continue;

    const numCols = grid[0]?.length || 0;

    // Freeze first 2 rows and first 2 columns
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 2, frozenColumnCount: 2 },
        },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    });

    // Bold row 0
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    });

    // Bold + light background for section header rows
    for (let r = 2; r < grid.length; r++) {
      const colA = grid[r][0] || '';
      const hasData = grid[r].slice(2).some((c) => c !== '');
      if (colA && !hasData) {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: numCols },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.93, blue: 0.98 },
              },
            },
            fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor',
          },
        });
      }
    }

    // Column widths
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 250 },
        fields: 'pixelSize',
      },
    });
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 100 },
        fields: 'pixelSize',
      },
    });
    if (numCols > 2) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: numCols },
          properties: { pixelSize: 160 },
          fields: 'pixelSize',
        },
      });
    }

    // Light gray header rows
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: numCols },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold',
      },
    });
  }

  if (requests.length === 0) return;

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
      console.warn(`  Warning: formatting batch ${i / 100 + 1} failed: ${res.status}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const createNew = args.includes('--new');
  const sheetIdIdx = args.indexOf('--sheet-id');
  const targetSheetId = sheetIdIdx >= 0 ? args[sheetIdIdx + 1] : DEFAULT_SHEET_ID;

  const dataPath = path.join(process.cwd(), '.cache-generated', 'field-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`No field data found at ${dataPath}`);
    console.error('Run "npx tsx scripts/generate-test-data.ts" first.');
    process.exit(1);
  }

  const allTestCases: Record<string, TestCase> = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Group by tab
  const byTab = new Map<string, TestCase[]>();
  for (const tc of Object.values(allTestCases)) {
    const list = byTab.get(tc.tab) || [];
    list.push(tc);
    byTab.set(tc.tab, list);
  }

  // Sort test cases within each tab by testId (natural sort)
  for (const [, list] of byTab) {
    list.sort((a, b) => a.testId.localeCompare(b.testId, undefined, { numeric: true }));
  }

  // Canonical tab order — Core HR tabs first, then modules alphabetically
  const TAB_ORDER = [
    'Core - Hires',
    'Core - rehires',
    'Core - Add Pending Workers',
    'Core - Add Non Worker',
    'Core - One app Pending to Hire',
    'Core - Create Work Relationship',
    'Core - Assign Change/XFR',
    'Core - Terms/Ends',
    'Core HR',
    'Payroll',
    'Absence Management',
    'Benefits',
    'Time and Labor',
    'Workforce Compensation',
    'Journeys',
    'MPDX',
    'SAA',
    'OneApp',
    'Other Functions',
  ];
  const tabNames = TAB_ORDER.filter((t) => byTab.has(t));
  for (const t of byTab.keys()) {
    if (!tabNames.includes(t)) tabNames.push(t);
  }

  const total = Object.keys(allTestCases).length;
  console.log(`\nLoaded ${total} test cases across ${tabNames.length} tabs:\n`);
  for (const tab of tabNames) {
    console.log(`  ${tab}: ${byTab.get(tab)!.length} test cases`);
  }

  // Build grids
  const tabGrids = new Map<string, string[][]>();
  for (const tab of tabNames) {
    tabGrids.set(tab, buildGrid(byTab.get(tab)!));
  }

  // Authenticate
  console.log('\nAuthenticating with Google...');
  const accessToken = await getAccessToken();
  console.log('  Authenticated.');

  let spreadsheetId: string;
  let sheetIds: Map<string, number>;

  if (createNew) {
    // Create a brand-new spreadsheet
    const today = new Date().toISOString().split('T')[0];
    const title = `UAT Test Data (Migration) - ${today}`;
    console.log(`\nCreating new spreadsheet: "${title}"...`);
    ({ spreadsheetId, sheetIds } = await createSpreadsheet(accessToken, title, tabNames));
    console.log(`  Created: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  } else {
    // Update existing spreadsheet in-place
    spreadsheetId = targetSheetId;
    console.log(`\nUpdating existing spreadsheet: ${spreadsheetId}`);

    const existingTabs = await getExistingTabs(accessToken, spreadsheetId);
    console.log(`  Existing tabs: ${[...existingTabs.keys()].join(', ')}`);

    // Sync tabs: add new, remove stale
    const added = tabNames.filter((t) => !existingTabs.has(t));
    const removed = [...existingTabs.keys()].filter((t) => !tabNames.includes(t));
    if (added.length > 0) console.log(`  Adding tabs: ${added.join(', ')}`);
    if (removed.length > 0) console.log(`  Removing tabs: ${removed.join(', ')}`);

    sheetIds = await syncTabs(accessToken, spreadsheetId, tabNames, existingTabs);

    // Clear data on all tabs before rewriting
    console.log('  Clearing existing data...');
    for (const tabName of tabNames) {
      await clearTab(accessToken, spreadsheetId, tabName);
    }
  }

  // Write data to each tab
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  console.log('\nWriting data...');
  for (const tabName of tabNames) {
    const grid = tabGrids.get(tabName)!;
    let attempts = 0;
    while (true) {
      try {
        await writeTabData(accessToken, spreadsheetId, tabName, grid);
        break;
      } catch (err: any) {
        if (err.message?.includes('429') && attempts < 5) {
          attempts++;
          console.log(`  Rate limited on "${tabName}", waiting 65s (attempt ${attempts})...`);
          await sleep(65_000);
        } else {
          throw err;
        }
      }
    }
    console.log(`  ${tabName}: ${byTab.get(tabName)!.length} cases, ${grid.length} rows x ${grid[0].length} cols`);
    await sleep(1_500);
  }

  // Apply formatting
  console.log('\nApplying formatting...');
  await applyFormatting(accessToken, spreadsheetId, sheetIds, tabGrids);
  console.log('  Done.');

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log('\n========================================');
  console.log(`  ${createNew ? 'New sheet' : 'Updated'}: ${url}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
