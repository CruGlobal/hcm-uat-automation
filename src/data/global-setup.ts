import fs from 'fs';
import path from 'path';
import { MODULE_TABS, tabToFilename } from './types';
import { fetchAllTabs } from './google-sheets-client';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');

/**
 * Playwright globalSetup — runs once before all tests.
 * Fetches all tabs from Google Sheets and caches as JSON.
 *
 * If Google credentials are not configured, uses existing cache files.
 */
async function globalSetup(): Promise<void> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const hasCredentials = !!(
    process.env.GOOGLE_SHEET_ID &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );

  if (!hasCredentials) {
    console.log('[global-setup] Google credentials not configured — using existing cache.');
    for (const tab of MODULE_TABS) {
      const filePath = path.join(CACHE_DIR, `${tabToFilename(tab)}.json`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf-8');
      }
    }
    return;
  }

  console.log(`[global-setup] Fetching ${MODULE_TABS.length} tabs from Google Sheets...`);

  const allData = await fetchAllTabs(MODULE_TABS);

  let totalCases = 0;
  for (const [tab, cases] of allData) {
    const filePath = path.join(CACHE_DIR, `${tabToFilename(tab)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cases, null, 2), 'utf-8');
    console.log(`  ${cases.length > 0 ? '✓' : '○'} ${tab}: ${cases.length} test cases`);
    totalCases += cases.length;
  }

  console.log(`[global-setup] Done. ${totalCases} total test cases cached.`);
}

export default globalSetup;
