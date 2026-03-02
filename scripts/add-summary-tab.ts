#!/usr/bin/env npx tsx

/**
 * Add a Summary tab to the existing UAT Automation Tracking Sheet.
 * Reads the sheet ID from .tracking-sheet-id (or --sheet-id <id>).
 *
 * The Summary tab uses COUNTIF formulas that reference each module tab's
 * Status column (J), so it auto-updates whenever statuses change.
 *
 * Usage:
 *   npx tsx scripts/add-summary-tab.ts
 *   npx tsx scripts/add-summary-tab.ts --sheet-id <id>
 */

import * as dotenv from 'dotenv';
import { getAccessToken, getSheetInfo, getTrackingSheetId, SHEETS_API } from './lib/google-sheets';

dotenv.config();

const SUMMARY_TAB = 'Summary';
const SUMMARY_COLS = ['Module', 'Total', 'Passed', 'Failed', 'Skipped', 'In Progress', 'Not Run', 'Pass Rate'];

// Module tabs in order (must match the tracking sheet tab names)
const MODULE_TABS = [
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

// ─── Summary grid ─────────────────────────────────────────────────────────────

function buildSummaryGrid(moduleTabNames: string[]): string[][] {
  const DATA_START = 5; // 1-based row number of first module row

  const rows: string[][] = [
    // Row 1: Title (merged later via formatting)
    ['UAT Automation Test Summary', '', '', '', '', '', '', ''],
    // Row 2: Last updated — timestamp written by update-tracking-sheet.ts
    ['Last Updated:', '', '', '', '', '', '', ''],
    // Row 3: blank
    ['', '', '', '', '', '', '', ''],
    // Row 4: Column headers
    [...SUMMARY_COLS],
  ];

  // Module rows
  for (let i = 0; i < moduleTabNames.length; i++) {
    const tab = moduleTabNames[i];
    const safe = tab.replace(/'/g, "''");
    const r = DATA_START + i;
    rows.push([
      tab,
      `=COUNTA('${safe}'!A2:A)`,
      `=COUNTIF('${safe}'!J2:J,"Passed")`,
      `=COUNTIF('${safe}'!J2:J,"Failed")`,
      `=COUNTIF('${safe}'!J2:J,"Skipped")`,
      `=COUNTIF('${safe}'!J2:J,"In Progress")`,
      `=B${r}-C${r}-D${r}-E${r}-F${r}`,
      `=IF(B${r}>0,C${r}/B${r},0)`,
    ]);
  }

  // Blank separator
  rows.push(['', '', '', '', '', '', '', '']);

  // TOTAL row
  const lastData = DATA_START + moduleTabNames.length - 1;
  const totalRow = DATA_START + moduleTabNames.length + 1;
  rows.push([
    'TOTAL',
    `=SUM(B${DATA_START}:B${lastData})`,
    `=SUM(C${DATA_START}:C${lastData})`,
    `=SUM(D${DATA_START}:D${lastData})`,
    `=SUM(E${DATA_START}:E${lastData})`,
    `=SUM(F${DATA_START}:F${lastData})`,
    `=SUM(G${DATA_START}:G${lastData})`,
    `=IF(B${totalRow}>0,C${totalRow}/B${totalRow},0)`,
  ]);

  return rows;
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function batchUpdate(accessToken: string, spreadsheetId: string, requests: any[]): Promise<void> {
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`batchUpdate failed: ${res.status} ${await res.text()}`);
}

async function writeValues(accessToken: string, spreadsheetId: string, grid: string[][]): Promise<void> {
  const range = `'${SUMMARY_TAB}'`;
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: grid }),
  });
  if (!res.ok) throw new Error(`Write to "${SUMMARY_TAB}" failed: ${res.status} ${await res.text()}`);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

async function applyFormatting(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  moduleCount: number,
): Promise<void> {
  const DATA_START_IDX = 4; // 0-based index of first module row (row 5)
  const totalRowIdx = DATA_START_IDX + moduleCount + 1; // after the blank separator
  const numCols = SUMMARY_COLS.length;

  const requests: any[] = [];

  // Merge title cells A1:H1
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
      mergeType: 'MERGE_ALL',
    },
  });

  // Style title row: large bold text, dark navy background
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.13, green: 0.2, blue: 0.4 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment)',
    },
  });

  // Taller title row
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 50 },
      fields: 'pixelSize',
    },
  });

  // Style header row (row 4, index 3)
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: numCols },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.2, green: 0.33, blue: 0.53 },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
    },
  });

  // Style TOTAL row: bold + light blue background
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: totalRowIdx, endRowIndex: totalRowIdx + 1, startColumnIndex: 0, endColumnIndex: numCols },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          backgroundColor: { red: 0.87, green: 0.9, blue: 0.97 },
        },
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  });

  // Format Pass Rate column (H = index 7) as percentage for data + total rows
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: DATA_START_IDX, endRowIndex: totalRowIdx + 1, startColumnIndex: 7, endColumnIndex: 8 },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'PERCENT', pattern: '0%' },
          horizontalAlignment: 'CENTER',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  // Center-align numeric columns (B–H) in data + total rows
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: DATA_START_IDX, endRowIndex: totalRowIdx + 1, startColumnIndex: 1, endColumnIndex: numCols },
      cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
      fields: 'userEnteredFormat.horizontalAlignment',
    },
  });

  // Alternating row colors for module data rows
  requests.push({
    addBanding: {
      bandedRange: {
        range: {
          sheetId,
          startRowIndex: DATA_START_IDX,
          endRowIndex: DATA_START_IDX + moduleCount,
          startColumnIndex: 0,
          endColumnIndex: numCols,
        },
        rowProperties: {
          firstBandColor: { red: 1, green: 1, blue: 1 },
          secondBandColor: { red: 0.93, green: 0.95, blue: 0.98 },
        },
      },
    },
  });

  // Column widths
  const colWidths: [number, number, number][] = [
    [0, 1, 210], // Module
    [1, 2, 65],  // Total
    [2, 3, 75],  // Passed
    [3, 4, 70],  // Failed
    [4, 5, 70],  // Skipped
    [5, 6, 95],  // In Progress
    [6, 7, 75],  // Not Run
    [7, 8, 85],  // Pass Rate
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

  // Conditional formatting on Pass Rate (H): green ≥80%, yellow ≥50%, red <50%
  const cfRange = {
    sheetId,
    startRowIndex: DATA_START_IDX,
    endRowIndex: totalRowIdx + 1,
    startColumnIndex: 7,
    endColumnIndex: 8,
  };
  const firstDataRow = DATA_START_IDX + 1; // 1-based (row 5)
  const cfRules: [string, { red: number; green: number; blue: number }][] = [
    [`=$H${firstDataRow}>=0.8`, { red: 0.72, green: 0.88, blue: 0.72 }],
    [`=$H${firstDataRow}>=0.5`, { red: 1, green: 0.95, blue: 0.7 }],
    [`=$H${firstDataRow}<0.5`, { red: 0.96, green: 0.7, blue: 0.7 }],
  ];
  for (let i = 0; i < cfRules.length; i++) {
    const [formula, bg] = cfRules[i];
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [cfRange],
          booleanRule: {
            condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
            format: { backgroundColor: bg },
          },
        },
        index: i,
      },
    });
  }

  await batchUpdate(accessToken, spreadsheetId, requests);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const sheetIdIdx = args.indexOf('--sheet-id');
  const spreadsheetId = sheetIdIdx >= 0
    ? args[sheetIdIdx + 1]
    : getTrackingSheetId();

  if (!spreadsheetId) {
    console.error('No tracking sheet ID found. Pass --sheet-id <id> or run create-tracking-sheet.ts first.');
    process.exit(1);
  }

  console.log('\nAuthenticating with Google...');
  const accessToken = await getAccessToken();

  console.log(`\nReading sheet: ${spreadsheetId}`);
  const { tabs, sheetIds } = await getSheetInfo(accessToken, spreadsheetId);
  console.log(`  Existing tabs: ${tabs.join(', ')}`);

  // Determine which module tabs actually exist in this sheet
  const presentModuleTabs = MODULE_TABS.filter((t) => tabs.includes(t));
  if (presentModuleTabs.length === 0) {
    console.error('No known module tabs found in this sheet. Is this the right sheet?');
    process.exit(1);
  }
  console.log(`  Module tabs found: ${presentModuleTabs.length}`);

  if (tabs.includes(SUMMARY_TAB)) {
    console.log(`\n"${SUMMARY_TAB}" tab already exists — it will be overwritten.`);
    // Delete the existing Summary tab first so we can re-add it at position 0
    await batchUpdate(accessToken, spreadsheetId, [
      { deleteSheet: { sheetId: sheetIds.get(SUMMARY_TAB) } },
    ]);
    console.log('  Deleted existing Summary tab.');
  }

  // Add the Summary tab as the first sheet
  console.log(`\nAdding "${SUMMARY_TAB}" tab...`);
  const addRes = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: SUMMARY_TAB, index: 0 } } }],
    }),
  });
  if (!addRes.ok) throw new Error(`Add sheet failed: ${addRes.status} ${await addRes.text()}`);
  const addData = await addRes.json();
  const summarySheetId: number = addData.replies[0].addSheet.properties.sheetId;
  console.log(`  Created "${SUMMARY_TAB}" tab (sheetId: ${summarySheetId})`);

  // Write formula data
  console.log('\nWriting formulas...');
  const grid = buildSummaryGrid(presentModuleTabs);
  await writeValues(accessToken, spreadsheetId, grid);
  console.log(`  ${grid.length - 4} module rows + TOTAL row written`);

  // Apply formatting
  console.log('\nApplying formatting...');
  await applyFormatting(accessToken, spreadsheetId, summarySheetId, presentModuleTabs.length);
  console.log('  Done.');

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log('\n================================================');
  console.log(`  Summary tab added to existing tracking sheet`);
  console.log(`  ${presentModuleTabs.length} modules — totals auto-update from Status columns`);
  console.log(`  ${url}`);
  console.log('================================================\n');
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
