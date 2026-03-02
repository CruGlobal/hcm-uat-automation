import * as dotenv from 'dotenv';
import { getAccessToken, getSheetTabs, readSheetTab } from './lib/google-sheets';

dotenv.config();

const TRACKING_SHEET_ID = '1oJmPmQJbJPt61PLow6bPSmHmGOPZnS2edTHIICIKLo8';

async function main() {
  const token = await getAccessToken();
  const tabs = await getSheetTabs(token, TRACKING_SHEET_ID);
  console.log('Tabs:', tabs.join(', '));
  
  const failing: {testId: string, module: string, errorMsg: string}[] = [];
  const passed: string[] = [];
  
  for (const tab of tabs) {
    if (tab === 'Summary' || tab === 'Instructions and Index' || tab === 'UAT_DATA') continue;
    const rows = await readSheetTab(token, TRACKING_SHEET_ID, tab);
    if (rows.length < 2) continue;
    const header = rows[0];
    const statusCol = header.indexOf('Status');
    const testIdCol = header.indexOf('Test ID');
    const actualResultCol = header.indexOf('Actual Result');
    if (statusCol < 0 || testIdCol < 0) continue;
    
    for (const row of rows.slice(1)) {
      const status = (row[statusCol] || '').trim();
      const testId = (row[testIdCol] || '').trim();
      const actualResult = (row[actualResultCol] || '').trim();
      if (status === 'Failed') {
        failing.push({ testId, module: tab, errorMsg: actualResult.substring(0, 200) });
      } else if (status === 'Passed') {
        passed.push(testId);
      }
    }
  }
  
  console.log(`\nTotal Passing in Automation: ${passed.length}`);
  console.log(`Total Failing in Automation: ${failing.length}`);
  console.log('\n=== FAILING TESTS ===');
  for (const f of failing) {
    console.log(`  ${f.testId} | ${f.module} | ${f.errorMsg}`);
  }
  
  // Output as JSON for team use
  const fs = await import('fs');
  fs.writeFileSync('.cache/automation-failures.json', JSON.stringify(failing, null, 2));
  console.log('\nSaved to .cache/automation-failures.json');
}

main().catch(console.error);
