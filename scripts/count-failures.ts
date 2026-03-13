import * as dotenv from 'dotenv';
import { getAccessToken, getSheetTabs, readSheetTab, getTrackingSheetId } from './lib/google-sheets';

dotenv.config();

async function main() {
  const token = await getAccessToken();
  const sheetId = await getTrackingSheetId(process.cwd());
  const tabs = await getSheetTabs(token, sheetId);
  
  const failedTests: {testId: string; module: string; title: string}[] = [];
  
  for (const tab of tabs) {
    if (tab === 'Summary' || tab === 'Sheet1') continue;
    const rows = await readSheetTab(token, sheetId, tab);
    if (rows.length === 0) continue;
    
    const headers = Object.values(rows[0] as any[]);
    const statusIdx = headers.findIndex((h: any) => String(h).trim() === 'Status');
    const testIdIdx = headers.findIndex((h: any) => String(h).trim() === 'Test ID');
    const titleIdx = headers.findIndex((h: any) => String(h).trim() === 'Test Scenario');
    if (statusIdx < 0) continue;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as any[];
      const status = String(row[statusIdx] || '').trim();
      if (status === 'Failed') {
        failedTests.push({
          testId: String(row[testIdIdx] || ''),
          module: tab,
          title: String(row[titleIdx] || '').substring(0, 80),
        });
      }
    }
  }
  
  console.log(`Failed tests (${failedTests.length}):`);
  for (const t of failedTests) {
    console.log(`  ${t.testId} [${t.module}] ${t.title}`);
  }
}
main().catch(console.error);
