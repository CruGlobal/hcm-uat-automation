/**
 * Check: which bot does each "Not Run" test assign to, and do all bots have credentials?
 */
import { loadUATPlan } from '../src/data/uat-plan-provider';
import { getBotForTester, getBotCredentials } from '../src/config/bot-users';
import { getAccessToken, getSheetTabs, readSheetTab, getTrackingSheetId } from './lib/google-sheets';

async function main() {
  const spreadsheetId = getTrackingSheetId();
  const accessToken = await getAccessToken();
  const tabs = await getSheetTabs(accessToken, spreadsheetId);

  const allTests = loadUATPlan();
  const testsById = new Map(allTests.map(tc => [tc.testId, tc]));

  const moduleTabs = [
    'Core HR', 'Payroll', 'Absence Management', 'Benefits',
    'Time and Labor', 'Journeys', 'Workforce Compensation',
    'MPDX', 'OneApp', 'SAA', 'Other Functions',
  ];

  const missingCreds: { testId: string; botName: string }[] = [];
  const hasAllCreds: { testId: string; botName: string }[] = [];

  for (const tab of moduleTabs) {
    if (!tabs.includes(tab)) continue;
    const rows = await readSheetTab(accessToken, spreadsheetId, tab);
    for (let i = 1; i < rows.length; i++) {
      const testId = (rows[i][0] || '').trim();
      const status = (rows[i][9] || '').trim();
      if (!testId || (status.toLowerCase() !== 'not run' && status !== '')) continue;

      const tc = testsById.get(testId);
      if (!tc) continue;

      const bot = getBotForTester(tc.testerName, tc.module || tab);
      if (getBotCredentials(bot.botName)) {
        hasAllCreds.push({ testId, botName: bot.botName });
      } else {
        missingCreds.push({ testId, botName: bot.botName });
      }
    }
  }

  console.log(`\n🤖 BOT ASSIGNMENT CHECK\n`);
  console.log(`  Tests with valid bot credentials: ${hasAllCreds.length}`);
  console.log(`  Tests with missing bot credentials: ${missingCreds.length}\n`);

  if (missingCreds.length > 0) {
    console.log(`❌ MISSING CREDENTIALS:\n`);
    for (const { testId, botName } of missingCreds) {
      console.log(`  ${testId} → ${botName}`);
    }
  }
}

main().catch(console.error);
