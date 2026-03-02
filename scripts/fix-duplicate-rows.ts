#!/usr/bin/env npx tsx
/**
 * Fix duplicate testId rows in the tracking sheet where an earlier row has a
 * status ("Passed"/"Failed") but a later row for the same testId is still empty.
 *
 * This happens because update-tracking-sheet.ts only updates the first matching
 * row per testId, leaving any subsequent duplicate rows with empty status columns.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-rows.ts
 *   npx tsx scripts/fix-duplicate-rows.ts --dry-run
 */

import * as dotenv from 'dotenv';
import {
  getAccessToken,
  getSheetTabs,
  readSheetTab,
  batchUpdateCells,
  getTrackingSheetId,
  type CellUpdate,
} from './lib/google-sheets';

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');

const MODULE_TABS = [
  'Core HR', 'Payroll', 'Absence Management', 'Benefits',
  'Time and Labor', 'Journeys', 'Workforce Compensation',
  'MPDX', 'OneApp', 'SAA', 'Other Functions',
];

async function main() {
  const spreadsheetId = getTrackingSheetId();
  if (!spreadsheetId) {
    console.error('No tracking sheet ID found. Run create-tracking-sheet.ts first.');
    process.exit(1);
  }

  const accessToken = await getAccessToken();
  const tabs = await getSheetTabs(accessToken, spreadsheetId);

  const cellUpdates: CellUpdate[] = [];
  let totalFixed = 0;

  for (const tab of MODULE_TABS) {
    if (!tabs.includes(tab)) continue;

    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    if (rows.length < 2) continue;

    // Build map: testId → all rows with their status
    const byTestId = new Map<string, { rowNum: number; status: string; actualResult: string }[]>();
    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      if (!testId) continue;
      const status = (rows[i][9] || '').trim();       // Column J
      const actualResult = (rows[i][10] || '').trim(); // Column K
      const list = byTestId.get(testId) || [];
      list.push({ rowNum: i + 1, status, actualResult });
      byTestId.set(testId, list);
    }

    // For each testId with multiple rows, propagate the first non-empty status
    // to all rows that are still empty.
    let tabFixed = 0;
    for (const [testId, rowList] of byTestId) {
      if (rowList.length <= 1) continue;

      // Find the first row that has a status
      const sourceRow = rowList.find(r => r.status);
      if (!sourceRow) continue; // All rows empty — nothing to propagate

      // Propagate to all empty rows
      for (const row of rowList) {
        if (row.status) continue; // Already has a status
        console.log(`  ${tab} row ${row.rowNum}: testId="${testId}" — copying "${sourceRow.status}" from row ${sourceRow.rowNum}`);
        const safeTab = tab.replace(/'/g, "''");
        cellUpdates.push({ range: `'${safeTab}'!J${row.rowNum}`, value: sourceRow.status });
        cellUpdates.push({ range: `'${safeTab}'!K${row.rowNum}`, value: sourceRow.actualResult });
        cellUpdates.push({ range: `'${safeTab}'!L${row.rowNum}`, value: 'Automation' });
        tabFixed++;
        totalFixed++;
      }
    }

    if (tabFixed > 0) console.log(`  ${tab}: fixed ${tabFixed} rows`);
  }

  console.log(`\nTotal rows to fix: ${totalFixed}`);

  if (totalFixed === 0) {
    console.log('No duplicate empty rows found.');
    return;
  }

  if (isDryRun) {
    console.log('[dry-run] Would update the above cells. Run without --dry-run to apply.');
    return;
  }

  console.log('Writing updates to sheet...');
  await batchUpdateCells(accessToken, spreadsheetId, cellUpdates);
  console.log(`Done. Fixed ${totalFixed} duplicate empty rows.`);
}

main().catch(err => { console.error(err); process.exit(1); });
