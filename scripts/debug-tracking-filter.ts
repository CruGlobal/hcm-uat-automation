/**
 * Debug script: show which "Not Run" tests are filtered out and why
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

  let notRunTotal = 0;
  let foundInCache = 0;
  let filteredOut = 0;

  const filteredOutTests: any[] = [];

  for (const tab of moduleTabs) {
    if (!tabs.includes(tab)) continue;
    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    if (rows.length < 2) continue;

    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      const status = (rows[i][9] || '').trim(); // Column J = Status
      if (!testId || status.toLowerCase() !== 'not run' && status !== '') continue;

      notRunTotal++;

      const tc = testsById.get(testId);
      if (!tc) {
        filteredOutTests.push({
          testId,
          reason: 'NOT IN CACHE',
          businessProcess: '—',
          testScript: '—',
          transactionCategory: '—',
        });
        filteredOut++;
        continue;
      }

      foundInCache++;

      const isEmptyRows = !tc.businessProcess && !tc.testScript && !tc.transactionCategory;
      if (isEmptyRows) {
        filteredOutTests.push({
          testId,
          reason: 'EMPTY BP/TS/TC',
          businessProcess: tc.businessProcess || '(empty)',
          testScript: tc.testScript || '(empty)',
          transactionCategory: tc.transactionCategory || '(empty)',
        });
        filteredOut++;
      }
    }
  }

  console.log('\n📊 TRACKING SHEET vs UAT PLAN CACHE\n');
  console.log(`  Tests marked "Not Run" in tracking sheet: ${notRunTotal}`);
  console.log(`  Found in UAT Plan cache: ${foundInCache}`);
  console.log(`  Filtered out (empty BP/TS/TC): ${filteredOut}`);
  console.log(`  Expected testable tests: ${notRunTotal - filteredOut}\n`);

  if (filteredOutTests.length > 0) {
    console.log('❌ FILTERED OUT TESTS:\n');
    console.log('  TestID           Reason             BusinessProcess         TestScript              TransactionCategory');
    console.log('  ' + '─'.repeat(130));
    for (const t of filteredOutTests.slice(0, 20)) {
      const bp = (t.businessProcess || '').substring(0, 23).padEnd(23);
      const ts = (t.testScript || '').substring(0, 23).padEnd(23);
      const tc = (t.transactionCategory || '').substring(0, 23).padEnd(23);
      console.log(`  ${t.testId.padEnd(16)} ${t.reason.padEnd(18)} ${bp} ${ts} ${tc}`);
    }
    if (filteredOutTests.length > 20) {
      console.log(`  ... and ${filteredOutTests.length - 20} more`);
    }
  }

  console.log('');
}

main().catch(console.error);
