#!/usr/bin/env npx tsx
/**
 * Fetch hyperlinks from the "Test Script (Link)" column in the UAT Plan.
 * Downloads all linked test script spreadsheets/docs.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const SHEET_ID = '13EQVOBPwGWnQ3TEkMU52mPS88uViDhwO-TgY88sLguY';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OUTPUT_DIR = path.resolve(process.cwd(), '.cache', 'test-scripts');

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

// Tabs to check for hyperlinks
const TABS_TO_CHECK = [
  'Core HR', 'Benefits', 'Absence Management', 'Payroll',
  'Time and Labor', 'Journeys', 'Workforce Compensation',
  'MPDX', 'OneApp', 'SAA', 'Other Functions',
];

async function fetchHyperlinks(tabName: string, accessToken: string): Promise<Map<string, string>> {
  // Fetch with grid data to get hyperlinks — columns A through R
  const range = encodeURIComponent(`'${tabName}'!A:R`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=${range}&includeGridData=true&fields=sheets.data.rowData.values(hyperlink,formattedValue)`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.warn(`  Failed to fetch grid data for "${tabName}": ${res.status}`);
    return new Map();
  }

  const data = await res.json();
  const rows = data.sheets?.[0]?.data?.[0]?.rowData || [];

  // Find which column(s) contain "Test Script" in the header
  const headerRow = rows[0]?.values || [];
  const scriptCols: number[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    const val = (headerRow[c]?.formattedValue || '').toLowerCase();
    if (val.includes('test script')) {
      scriptCols.push(c);
    }
  }

  if (scriptCols.length === 0) {
    console.warn(`  No "Test Script" column found in "${tabName}"`);
    return new Map();
  }

  console.log(`  Test Script columns: ${scriptCols.map(c => String.fromCharCode(65 + c)).join(', ')}`);

  // Collect all hyperlinks from those columns
  const links = new Map<string, string>();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]?.values || [];
    for (const c of scriptCols) {
      const cell = cells[c];
      if (cell?.hyperlink && cell?.formattedValue) {
        const scriptName = cell.formattedValue.trim();
        const link = cell.hyperlink;
        if (scriptName && link && !links.has(scriptName)) {
          links.set(scriptName, link);
        }
      }
    }
  }

  return links;
}

async function fetchLinkedSheet(scriptName: string, url: string, accessToken: string): Promise<any> {
  // Extract sheet ID from Google Sheets/Docs URL
  const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);

  if (sheetMatch) {
    const linkedSheetId = sheetMatch[1];
    // Get all tabs from this sheet
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${linkedSheetId}?fields=sheets.properties.title`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!metaRes.ok) {
      console.warn(`    Failed to fetch metadata for "${scriptName}": ${metaRes.status}`);
      return null;
    }
    const metaData = await metaRes.json();
    const tabNames = (metaData.sheets || []).map((s: any) => s.properties.title);

    // Fetch all tabs
    const allTabs: Record<string, string[][]> = {};
    for (const tab of tabNames) {
      const range = encodeURIComponent(`'${tab}'`);
      const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${linkedSheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
      const dataRes = await fetch(dataUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (dataRes.ok) {
        const body = await dataRes.json();
        allTabs[tab] = (body.values || []).map((row: any[]) =>
          row.map((cell) => (cell == null ? '' : String(cell).trim()))
        );
      }
    }

    return { type: 'spreadsheet', id: linkedSheetId, url, tabs: allTabs, tabNames };
  }

  if (docMatch) {
    // Google Doc — just store the reference
    return { type: 'document', id: docMatch[1], url };
  }

  return { type: 'unknown', url };
}

async function main() {
  console.log('Fetching test script links from UAT Plan...');
  const accessToken = await getAccessToken();

  const allLinks = new Map<string, string>();

  for (const tab of TABS_TO_CHECK) {
    console.log(`\nChecking tab: ${tab}`);
    const links = await fetchHyperlinks(tab, accessToken);
    console.log(`  Found ${links.size} unique script links`);
    for (const [name, url] of links) {
      if (!allLinks.has(name)) allLinks.set(name, url);
    }
  }

  console.log(`\n=== Total unique test script links: ${allLinks.size} ===`);

  // Save the link map
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const linkMapFile = path.join(OUTPUT_DIR, '_link-map.json');
  const linkMap: Record<string, string> = {};
  for (const [name, url] of allLinks) {
    linkMap[name] = url;
  }
  fs.writeFileSync(linkMapFile, JSON.stringify(linkMap, null, 2));
  console.log(`Link map saved to: ${linkMapFile}`);

  // Group links by target spreadsheet to minimize API calls
  const bySpreadsheet = new Map<string, { scriptName: string; url: string }[]>();
  for (const [name, url] of allLinks) {
    const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const key = sheetMatch ? sheetMatch[1] : url;
    if (!bySpreadsheet.has(key)) bySpreadsheet.set(key, []);
    bySpreadsheet.get(key)!.push({ scriptName: name, url });
  }

  console.log(`\nUnique linked spreadsheets/docs: ${bySpreadsheet.size}`);

  // Fetch each unique linked spreadsheet
  let fetched = 0;
  for (const [key, scripts] of bySpreadsheet) {
    const firstScript = scripts[0];
    console.log(`\n  Fetching: ${firstScript.scriptName} (${scripts.length} scripts reference this)`);
    console.log(`    URL: ${firstScript.url}`);

    try {
      const data = await fetchLinkedSheet(firstScript.scriptName, firstScript.url, accessToken);
      if (data) {
        const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
        const outFile = path.join(OUTPUT_DIR, `${safeName}.json`);
        fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
        console.log(`    Saved: ${outFile}`);
        if (data.type === 'spreadsheet') {
          console.log(`    Tabs: ${data.tabNames.join(', ')}`);
          for (const tab of data.tabNames) {
            console.log(`      ${tab}: ${(data.tabs[tab] || []).length} rows`);
          }
        }
        fetched++;
      }
    } catch (err) {
      console.warn(`    Error: ${(err as Error).message}`);
    }
  }

  console.log(`\n=== Fetched ${fetched}/${bySpreadsheet.size} linked documents ===`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
