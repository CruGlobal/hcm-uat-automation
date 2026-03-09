/**
 * Mark tests as "Deferred" in the UAT Automation Tracking Sheet.
 *
 * Two modes:
 *   1. By UAT Plan status: marks tests that are "Deferred" in the UAT Plan
 *   2. By module: marks ALL tests in specified modules as "Deferred"
 *
 * Usage:
 *   npx tsx scripts/mark-deferred-tests.ts [--dry-run]
 *   npx tsx scripts/mark-deferred-tests.ts --modules "MPDX,SAA,Journeys,OneApp" [--dry-run]
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import {
  getAccessToken,
  getSheetTabs,
  readSheetTab,
  batchUpdateCells,
  type CellUpdate,
} from './lib/google-sheets';

dotenv.config();

const TRACKING_SHEET_ID = '1oJmPmQJbJPt61PLow6bPSmHmGOPZnS2edTHIICIKLo8';
const UAT_PLAN_CACHE = '.cache/uat-plan.json';
const DRY_RUN = process.argv.includes('--dry-run');

// Parse --modules flag
const modulesArgIdx = process.argv.indexOf('--modules');
const deferModules: Set<string> | null = modulesArgIdx >= 0 && process.argv[modulesArgIdx + 1]
  ? new Set(process.argv[modulesArgIdx + 1].split(',').map(m => m.trim()))
  : null;

async function main() {
  // Build set of test IDs to defer — either from UAT Plan status or by module tabs
  const deferredIds = new Set<string>();

  if (!deferModules) {
    // Mode 1: Load UAT Plan and find all Deferred test IDs
    const plan: any[] = JSON.parse(fs.readFileSync(UAT_PLAN_CACHE, 'utf-8'));
    const seen = new Set<string>();
    for (const tc of plan) {
      const id = tc.testId?.trim();
      if (!id) continue;
      if (!seen.has(id)) {
        seen.add(id);
        if ((tc.status || '').trim().toLowerCase() === 'deferred') {
          deferredIds.add(id);
        }
      }
    }
    console.log(`Found ${deferredIds.size} deferred test IDs in UAT Plan`);
  } else {
    console.log(`Deferring entire modules: ${[...deferModules].join(', ')}`);
  }

  const token = await getAccessToken();
  const tabs = await getSheetTabs(token, TRACKING_SHEET_ID);
  console.log(`Tracking sheet has ${tabs.length} tabs: ${tabs.join(', ')}\n`);

  const updates: CellUpdate[] = [];
  let alreadyDeferred = 0;

  for (const tab of tabs) {
    if (tab === 'Summary' || tab === 'Instructions and Index' || tab === 'UAT_DATA' || tab === 'Sheet1') continue;

    // In module mode, only process matching tabs
    if (deferModules && !deferModules.has(tab)) continue;

    const rows = await readSheetTab(token, TRACKING_SHEET_ID, tab);
    if (rows.length < 2) continue;

    const header = rows[0];
    const testIdCol = header.findIndex(h => h.trim().toLowerCase() === 'test id');
    const statusCol = header.findIndex(h => h.trim().toLowerCase() === 'status');
    if (testIdCol < 0 || statusCol < 0) continue;

    const statusColLetter = colLetter(statusCol);

    for (let r = 1; r < rows.length; r++) {
      const testId = (rows[r][testIdCol] || '').trim();
      if (!testId) continue;

      // In ID mode, only defer matching IDs; in module mode, defer all rows in the tab
      if (!deferModules && !deferredIds.has(testId)) continue;

      const currentStatus = (rows[r][statusCol] || '').trim();
      if (currentStatus === 'Deferred') {
        alreadyDeferred++;
        continue;
      }

      const range = `'${tab}'!${statusColLetter}${r + 1}`;
      updates.push({ range, value: 'Deferred' });
      console.log(`  [${tab}] Row ${r + 1}: ${testId} — "${currentStatus}" → "Deferred"`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Updates to apply: ${updates.length}`);
  console.log(`  Already "Deferred": ${alreadyDeferred}`);

  if (updates.length === 0) {
    console.log('\nNothing to update.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes written.');
    return;
  }

  console.log(`\nWriting ${updates.length} updates to tracking sheet...`);
  await batchUpdateCells(token, TRACKING_SHEET_ID, updates);
  console.log('Done!');
}

/** Convert 0-based column index to A1 column letter(s) */
function colLetter(col: number): string {
  let s = '';
  col++;
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

main().catch(console.error);
