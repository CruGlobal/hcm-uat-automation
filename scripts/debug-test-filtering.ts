/**
 * Debug: show exactly which tests are filtered out and why
 */
import { loadUATPlan } from '../src/data/uat-plan-provider';
import { getAccessToken, getSheetTabs, readSheetTab, getTrackingSheetId } from './lib/google-sheets';

async function main() {
  const spreadsheetId = getTrackingSheetId();
  if (!spreadsheetId) {
    console.error('GOOGLE_TRACKING_SHEET_ID not set');
    process.exit(1);
  }

  // Load UAT Plan from cache
  const allTests = loadUATPlan();
  const testsById = new Map(allTests.map(tc => [tc.testId, tc]));

  // Fetch tracking sheet
  const accessToken = await getAccessToken();
  const tabs = await getSheetTabs(accessToken, spreadsheetId);

  const moduleTabs = [
    'Core HR', 'Payroll', 'Absence Management', 'Benefits',
    'Time and Labor', 'Journeys', 'Workforce Compensation',
    'MPDX', 'OneApp', 'SAA', 'Other Functions',
  ];

  let passedTracking = 0;
  let passedBasic = 0;
  let passedAll = 0;
  const filtered: any[] = [];

  for (const tab of moduleTabs) {
    if (!tabs.includes(tab)) continue;
    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    if (rows.length < 2) continue;

    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      const status = (rows[i][9] || '').trim(); // Column J = Status
      if (!testId || (status.toLowerCase() !== 'not run' && status !== '')) continue;

      passedTracking++;

      const tc = testsById.get(testId);
      if (!tc) {
        filtered.push({ testId, reason: 'NOT_IN_CACHE' });
        continue;
      }

      // Check basic filters from isTestable()
      const tcStatus = tc.status.toLowerCase();
      if (tcStatus === 'deferred' || tcStatus === 'cancelled') {
        filtered.push({ testId, reason: `STATUS_DEFERRED_OR_CANCELLED (status="${tc.status}")` });
        continue;
      }

      // Check: has businessProcess, testScript, or transactionCategory
      if (!tc.businessProcess && !tc.testScript && !tc.transactionCategory) {
        filtered.push({ testId, reason: 'EMPTY_BP_TS_TC' });
        continue;
      }

      passedBasic++;
      passedAll++;
    }
  }

  console.log(`\n📊 TEST FILTERING BREAKDOWN\n`);
  console.log(`  Passed tracking-status filter: ${passedTracking}`);
  console.log(`  Passed basic filters (status, fields): ${passedBasic}`);
  console.log(`  Final expected testable: ${passedAll}\n`);

  if (filtered.length > 0) {
    console.log(`❌ FILTERED OUT (${filtered.length}):\n`);
    const byReason = new Map<string, string[]>();
    for (const f of filtered) {
      if (!byReason.has(f.reason)) byReason.set(f.reason, []);
      byReason.get(f.reason)!.push(f.testId);
    }
    for (const [reason, tests] of byReason) {
      console.log(`  ${reason}: ${tests.length}`);
      for (const t of tests) {
        console.log(`    ${t}`);
      }
    }
  }

  console.log('');
}

main().catch(console.error);
