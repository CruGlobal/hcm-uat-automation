#!/usr/bin/env npx tsx

/**
 * Mark automation-run tests in the tracking sheet.
 *
 * For each test ID in the alreadyRun list, writes "Automation" to column L
 * (Tester Name) without touching Status (col J) or Actual Result (col K).
 *
 * For tests where we have confirmed pass/fail results, those columns are also
 * updated.
 *
 * Usage:
 *   npx tsx scripts/mark-automation-tester.ts
 *   npx tsx scripts/mark-automation-tester.ts --dry-run
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

// ─── All test IDs dispatched to automation agents (waves 1–11) ───────────────

const AUTOMATION_RUN: Set<string> = new Set([
  // Waves 1–6 (baseline)
  "BN-045","BN-008","HR-187","HR-007","HR-281","HR-189","AB-008.02","AB.034.00","AB.031.00",
  "PY-009-06","HR-301","HR-075","HR-206","PY-051-07","PY-049","PY-075","WC-006","AB-007.00",
  "TL-050","JR-050","PY-003-03","AB-012.00","PY-003-04","HR-401","PY-018","HR-137","BN-118",
  "JR-015","PY-076","HR-127","JR-005","BN-116","PY-009-07","AB.041.00","AB-009.00","HR-038",
  "JR-049","AB-045.03","HR-358","PY-002","BN-038","AB.042.00","BN-112","JR-009","HR-060",
  "WC-012","HR-030","PY-059","HR-539","HR-543","WC-050","JR-026","WC-018","AB-057.00",
  "BN-068","BN-129","TL-033","OF-004","AB-043.00","BN-093","HR-001","MPDX-17","MPDX-13",
  "MPDX-04","MPDX-15","MPDX-03","1APP-05","1APP-03","1APP-07","SAA-01","SAA-02","SAA-03",
  "MPDX-20","TL-031","TL-090","MPDX-01","WC-022","TL-054","OF-003","TL-078","1APP-16",
  "WC-030","TL-010","1APP-21","MPDX-09","JR-002","BN-010","AB-007.01","PY-040","HR-210",
  "PY-051-04","BN-036","AB.036.00","TL-014","AB-009.01","WC-029","AB-052.01","AB-006.00",
  "BN-001","AB-003.00","SAA-04","HR-155","AB-007.02","MPDX-12","JR-001","WC-004",
  "BN-034","HR-076","JR-060","MPDX-14","OF-001","WC-001","HR-049","JR-034","HR-545",
  "HR-212","HR-006","HR-526","HR-527","WC-009","WC-023","WC-010","HR-077","WC-017",
  "HR-139","HR-013","AB-006.01","WC-021","WC-028","WC-027","HR-152","HR-175","HR-004",
  "WC-020","HR-079","HR-151","HR-515","HR-183","HR-012","HR-008","1APP-17","WC-035",
  "WC-034","WC-011","HR-016","HR-555","HR-180","AB-044.00","AB-045.01","TL-010.00",
  "TL-011","HR-005","AB.023.00","HR-115","AB-005.00","HR-141",
  "BN-134","AB.015.00","HR-327","HR-253","WC-040","HR-550","AB-051.00","HR-524","PY-048",
  "HR-084","HR-205","HR-171","HR-218","1APP-09","HR-514","TL-080","PY-033","AB-044.02",
  "HR-114","HR-424","HR-009","HR-536","WC-051","BN-128","BN-017","HR-088","HR-353",
  "JR-010","PY-051-01","1APP-10","JR-040","HR-503","JR-051","1APP-04",
  // Wave 7
  "PY-051-02","TL-005","HR-062","BN-127","AB-047.01","WC-047","HR-318","HR-453","WC-015",
  "HR-216","TL-030","HR-452","HR-370","JR-041","BN-054","HR-557","HR-045",
  // Wave 8
  "HR-042","BN-083","PY-036","HR-530","TL-016","HR-454","PY-051-03","HR-221","BN-069",
  "HR-010","HR-411","HR-081","AB-004.02","TL-045","WC-002","WC-043","HR-111",
  // Wave 9 + extras
  "HR-113","HR-064","HR-463","HR-372","HR-243","PY-051-06","PY-009-04","BN-063","BN-139",
  "HR-143","MPDX-11","JR-006","AB-009.02","HR-258","BN-123","HR-479","TL-063",
  "AB.032.00","HR-562","HR-230","HR-522",
  // Wave 10
  "JR-025","BN-041","HR-017","PY-011-02","AB.019.00","HR-476","HR-225","HR-330",
  "HR-462","HR-482","BN-035","AB-055.00","TL-006","TL-012","PY-051-05","TL-085","HR-349",
  // fixer-37 extras
  "HR-546","HR-510","HR-571","HR-575",
  // Wave 11
  "HR-485","TL-070","HR-126","HR-145","TL-043","BN-021","HR-446","BN-065",
  "JR-066","JR-042","PY-070","AB-012.01","MPDX-02","HR-418","WC-048","HR-182",
  // Confirmed from on-disk result files (outside wave system)
  "HR-247","HR-257",
]);

// Tests where we have confirmed pass results from on-disk JSON files
const CONFIRMED_PASSED: Set<string> = new Set([
  "HR-247", // results-bot_local_campus.json
  "HR-257", // results-bot_hr_local_campus.json
]);

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const spreadsheetId = getTrackingSheetId();
  if (!spreadsheetId) {
    console.error('No tracking sheet ID found. Check .tracking-sheet-id file.');
    process.exit(1);
  }

  console.log('\nAuthenticating with Google...');
  const accessToken = await getAccessToken();

  console.log('Fetching sheet tabs...');
  const tabs = await getSheetTabs(accessToken, spreadsheetId);
  console.log(`  ${tabs.length} tabs: ${tabs.join(', ')}`);

  const cellUpdates: CellUpdate[] = [];
  let matched = 0;
  let skipped = 0;

  for (const tab of tabs) {
    if (tab === 'Summary') continue;

    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    if (rows.length < 2) continue;

    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      if (!testId || !AUTOMATION_RUN.has(testId)) continue;

      const rowNum = i + 1; // 1-based
      const safeTab = tab.replace(/'/g, "''");
      const currentTester = (rows[i][11] || '').trim(); // col L (0-indexed = 11)

      // Always write Tester Name = "Automation"
      cellUpdates.push({ range: `'${safeTab}'!L${rowNum}`, value: 'Automation' });

      // For confirmed passes, also write Status + Actual Result
      if (CONFIRMED_PASSED.has(testId)) {
        cellUpdates.push({ range: `'${safeTab}'!J${rowNum}`, value: 'Passed' });
        cellUpdates.push({ range: `'${safeTab}'!K${rowNum}`, value: 'Passed (automation)' });
      }

      if (dryRun) {
        const action = CONFIRMED_PASSED.has(testId) ? 'Passed + Automation' : 'Automation (tester only)';
        console.log(`  ${testId} [${tab}] row ${rowNum} — ${action} (was: "${currentTester}")`);
      }

      matched++;
    }
  }

  console.log(`\nTotal matched: ${matched}, unmatched in sheet: ${AUTOMATION_RUN.size - matched}`);
  console.log(`Cell updates: ${cellUpdates.length}`);

  if (dryRun) {
    console.log('\n--- DRY RUN — no changes written ---');
    return;
  }

  if (cellUpdates.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  console.log('\nWriting updates to tracking sheet...');
  await batchUpdateCells(accessToken, spreadsheetId, cellUpdates);
  console.log(`Done. Marked ${matched} tests as "Automation" in Tester Name column.`);
  console.log(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
