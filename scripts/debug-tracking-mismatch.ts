/**
 * Find the exact discrepancy: which tests are on tracking sheet but missing from cache?
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
  const testIdsInCache = new Set(allTests.map(tc => tc.testId));

  // Fetch tracking sheet
  const accessToken = await getAccessToken();
  const tabs = await getSheetTabs(accessToken, spreadsheetId);

  const moduleTabs = [
    'Core HR', 'Payroll', 'Absence Management', 'Benefits',
    'Time and Labor', 'Journeys', 'Workforce Compensation',
    'MPDX', 'OneApp', 'SAA', 'Other Functions',
  ];

  const notRunOnSheet = new Set<string>();

  for (const tab of moduleTabs) {
    if (!tabs.includes(tab)) continue;
    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    if (rows.length < 2) continue;

    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      const status = (rows[i][9] || '').trim(); // Column J = Status
      if (!testId || (status.toLowerCase() !== 'not run' && status !== '')) continue;
      notRunOnSheet.add(testId);
    }
  }

  console.log(`\n📋 TRACKING SHEET vs CACHE MISMATCH\n`);
  console.log(`  "Not Run" tests on tracking sheet: ${notRunOnSheet.size}`);
  console.log(`  Tests in UAT Plan cache: ${testIdsInCache.size}`);

  // Find mismatches
  const onSheetButNotInCache: string[] = [];
  const inCacheButNotOnSheet: string[] = [];

  for (const testId of notRunOnSheet) {
    if (!testIdsInCache.has(testId)) {
      onSheetButNotInCache.push(testId);
    }
  }

  console.log(`\n❌ ON TRACKING SHEET BUT NOT IN CACHE (${onSheetButNotInCache.length}):`);
  for (const testId of onSheetButNotInCache.sort()) {
    console.log(`  ${testId}`);
  }

  if (onSheetButNotInCache.length === 0) {
    console.log('  None — all tracking sheet tests are in cache\n');

    // If they're all in cache, check if some are filtered out
    const testIdsWithData = new Set(
      allTests
        .filter(tc => tc.businessProcess || tc.testScript || tc.transactionCategory)
        .map(tc => tc.testId)
    );

    const inCacheButEmptyData: string[] = [];
    for (const testId of notRunOnSheet) {
      if (testIdsInCache.has(testId) && !testIdsWithData.has(testId)) {
        inCacheButEmptyData.push(testId);
      }
    }

    if (inCacheButEmptyData.length > 0) {
      console.log(`⚠️  STILL EMPTY IN CACHE (being filtered out):`);
      for (const testId of inCacheButEmptyData.sort()) {
        console.log(`  ${testId}`);
      }
    }
  }

  console.log('');
}

main().catch(console.error);
