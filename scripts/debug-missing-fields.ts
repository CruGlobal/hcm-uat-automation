/**
 * Detailed breakdown: for each "Not Run" test, show exactly what fields are missing
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

  const filteredTests: any[] = [];

  for (const tab of moduleTabs) {
    if (!tabs.includes(tab)) continue;
    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    if (rows.length < 2) continue;

    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      const status = (rows[i][9] || '').trim(); // Column J = Status
      if (!testId || (status.toLowerCase() !== 'not run' && status !== '')) continue;

      const tc = testsById.get(testId);
      if (!tc) continue;

      const hasBP = !!tc.businessProcess;
      const hasTS = !!tc.testScript;
      const hasTC = !!tc.transactionCategory;
      const isEmpty = !hasBP && !hasTS && !hasTC;

      if (isEmpty) {
        const missing: string[] = [];
        if (!hasBP) missing.push('businessProcess');
        if (!hasTS) missing.push('testScript');
        if (!hasTC) missing.push('transactionCategory');

        filteredTests.push({
          testId,
          missing: missing.join(', '),
          module: tc.module || tc.tabName,
        });
      }
    }
  }

  console.log(`\n📋 DETAILED BREAKDOWN: ${filteredTests.length} "Not Run" tests with missing fields\n`);
  console.log('TestID       Module                  Missing Fields');
  console.log('─'.repeat(100));

  for (const t of filteredTests) {
    const module = (t.module || '').substring(0, 20).padEnd(20);
    console.log(`${t.testId.padEnd(12)} ${module} ${t.missing}`);
  }

  // Summary
  const allMissing = new Set<string>();
  for (const t of filteredTests) {
    for (const field of t.missing.split(', ')) {
      allMissing.add(field);
    }
  }

  console.log('\n📊 Summary by field:\n');
  for (const field of Array.from(allMissing).sort()) {
    const count = filteredTests.filter(t => t.missing.includes(field)).length;
    console.log(`  ${field}: ${count} tests missing this`);
  }

  console.log('\n');
}

main().catch(console.error);
