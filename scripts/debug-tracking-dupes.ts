/**
 * Check for duplicate testIds on tracking sheet (same test for different roles)
 */
import { getAccessToken, getSheetTabs, readSheetTab, getTrackingSheetId } from './lib/google-sheets';

async function main() {
  const spreadsheetId = getTrackingSheetId();
  const accessToken = await getAccessToken();
  const tabs = await getSheetTabs(accessToken, spreadsheetId);

  const moduleTabs = [
    'Core HR', 'Payroll', 'Absence Management', 'Benefits',
    'Time and Labor', 'Journeys', 'Workforce Compensation',
    'MPDX', 'OneApp', 'SAA', 'Other Functions',
  ];

  const testIds: string[] = [];
  const testDetails: { testId: string; testerName: string }[] = [];

  for (const tab of moduleTabs) {
    if (!tabs.includes(tab)) continue;
    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      const status = (rows[i][9] || '').trim();
      const testerName = (rows[i][11] || '').trim(); // Column L = Tester Name (approximate)
      if (testId && (status.toLowerCase() === 'not run' || status === '')) {
        testIds.push(testId);
        testDetails.push({ testId, testerName });
      }
    }
  }

  const unique = new Set(testIds);
  console.log(`\n📊 TRACKING SHEET "NOT RUN" DUPLICATION CHECK\n`);
  console.log(`  Total "Not Run" rows: ${testIds.length}`);
  console.log(`  Unique testIds: ${unique.size}`);
  console.log(`  Duplicate rows: ${testIds.length - unique.size}\n`);

  if (testIds.length > unique.size) {
    const counts = new Map<string, number>();
    for (const id of testIds) counts.set(id, (counts.get(id) || 0) + 1);
    const dupes = Array.from(counts.entries()).filter(([_, c]) => c > 1);
    console.log(`Duplicate testIds (${dupes.length}):\n`);
    for (const [id, count] of dupes.sort()) {
      const roles = testDetails
        .filter(d => d.testId === id)
        .map(d => d.testerName || '?')
        .join(', ');
      console.log(`  ${id}: ${count} times (for: ${roles})`);
    }
  }
}

main().catch(console.error);
