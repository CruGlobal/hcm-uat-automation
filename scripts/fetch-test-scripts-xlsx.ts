#!/usr/bin/env npx tsx
/**
 * Fetch test script Excel files linked from the UAT Plan.
 * These are .xlsx files uploaded to Google Drive.
 * Uses Google Drive API to export them, then parses with xlsx library.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

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

// Load the link map
const linkMapFile = path.join(OUTPUT_DIR, '_link-map.json');
const linkMap: Record<string, string> = JSON.parse(fs.readFileSync(linkMapFile, 'utf-8'));

// Group by spreadsheet ID
const bySpreadsheet = new Map<string, { scriptName: string; gid: string }[]>();
for (const [scriptName, url] of Object.entries(linkMap)) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) continue;
  const sheetId = match[1];
  const gidMatch = url.match(/gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  if (!bySpreadsheet.has(sheetId)) bySpreadsheet.set(sheetId, []);
  bySpreadsheet.get(sheetId)!.push({ scriptName, gid });
}

console.log(`Unique spreadsheet files: ${bySpreadsheet.size}`);
for (const [sheetId, scripts] of bySpreadsheet) {
  console.log(`  ${sheetId}: ${scripts.length} scripts (${scripts.slice(0, 3).map(s => s.scriptName).join(', ')}...)`);
}

async function fetchSheetAsCSV(sheetId: string, gid: string, accessToken: string): Promise<string> {
  // Try exporting as CSV via Google Sheets API (works for native Google Sheets)
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'follow',
  });
  if (!res.ok) {
    // Try Google Drive API export for xlsx files
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=text/csv`;
    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!driveRes.ok) {
      throw new Error(`Failed to export: Sheets ${res.status}, Drive ${driveRes.status}`);
    }
    return driveRes.text();
  }
  return res.text();
}

async function fetchSheetMetadata(sheetId: string, accessToken: string): Promise<{ title: string; sheets: { title: string; sheetId: number }[] } | null> {
  // Try Sheets API first
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties(title,sheetId)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    // Try as Drive file
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${sheetId}?fields=name,mimeType`;
    const driveRes = await fetch(driveUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!driveRes.ok) return null;
    const driveData = await driveRes.json();
    return { title: driveData.name, sheets: [] };
  }
  const data = await res.json();
  return {
    title: data.properties.title,
    sheets: (data.sheets || []).map((s: any) => ({
      title: s.properties.title,
      sheetId: s.properties.sheetId,
    })),
  };
}

async function fetchTabData(sheetId: string, tabName: string, accessToken: string): Promise<string[][]> {
  const range = encodeURIComponent(`'${tabName}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.values || []).map((row: any[]) =>
    row.map((cell) => (cell == null ? '' : String(cell).trim()))
  );
}

async function main() {
  const accessToken = await getAccessToken();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [sheetId, scripts] of bySpreadsheet) {
    console.log(`\n=== Processing spreadsheet: ${sheetId} ===`);
    console.log(`  Scripts: ${scripts.map(s => s.scriptName).join(', ')}`);

    // Get metadata
    const meta = await fetchSheetMetadata(sheetId, accessToken);
    if (!meta) {
      console.log('  Could not fetch metadata, skipping');
      continue;
    }
    console.log(`  Title: ${meta.title}`);
    console.log(`  Tabs (${meta.sheets.length}): ${meta.sheets.map(s => s.title).join(', ')}`);

    if (meta.sheets.length === 0) {
      // This is likely an xlsx file — try Drive export
      console.log('  No tabs found — trying Drive export as Google Sheets...');

      // Try copying as Google Sheets format
      const copyUrl = `https://www.googleapis.com/drive/v3/files/${sheetId}/copy`;
      const copyRes = await fetch(copyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: `_temp_${sheetId}`, mimeType: 'application/vnd.google-apps.spreadsheet' }),
      });

      if (copyRes.ok) {
        const copyData = await copyRes.json();
        const copyId = copyData.id;
        console.log(`  Created temp copy: ${copyId}`);

        // Now fetch the copy's tabs
        const copyMeta = await fetchSheetMetadata(copyId, accessToken);
        if (copyMeta && copyMeta.sheets.length > 0) {
          console.log(`  Copy has ${copyMeta.sheets.length} tabs: ${copyMeta.sheets.map(s => s.title).join(', ')}`);

          const allData: Record<string, string[][]> = {};
          for (const sheet of copyMeta.sheets) {
            const rows = await fetchTabData(copyId, sheet.title, accessToken);
            allData[sheet.title] = rows;
            console.log(`    ${sheet.title}: ${rows.length} rows`);
          }

          // Map scripts to their specific tabs (by gid)
          const gidToTab = new Map<number, string>();
          for (const sheet of copyMeta.sheets) {
            gidToTab.set(sheet.sheetId, sheet.title);
          }

          // Save per-script data
          for (const script of scripts) {
            const scriptGid = parseInt(script.gid);
            const tabName = gidToTab.get(scriptGid);
            const safeName = script.scriptName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const outFile = path.join(OUTPUT_DIR, `${safeName}.json`);

            if (tabName && allData[tabName]) {
              fs.writeFileSync(outFile, JSON.stringify({
                scriptName: script.scriptName,
                sourceTab: tabName,
                rows: allData[tabName],
              }, null, 2));
              console.log(`  Saved: ${safeName}.json (${allData[tabName].length} rows from "${tabName}")`);
            } else {
              // Save all tabs if we can't match the gid
              fs.writeFileSync(outFile, JSON.stringify({
                scriptName: script.scriptName,
                requestedGid: script.gid,
                allTabs: Object.keys(allData),
                allData,
              }, null, 2));
              console.log(`  Saved: ${safeName}.json (all tabs, gid ${script.gid} not matched)`);
            }
          }

          // Delete the temp copy
          const deleteUrl = `https://www.googleapis.com/drive/v3/files/${copyId}`;
          await fetch(deleteUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
          console.log(`  Deleted temp copy: ${copyId}`);
        }
      } else {
        console.log(`  Copy failed: ${copyRes.status} ${await copyRes.text()}`);
      }
    } else {
      // Native Google Sheets — fetch each tab
      const allData: Record<string, string[][]> = {};
      for (const sheet of meta.sheets) {
        const rows = await fetchTabData(sheetId, sheet.title, accessToken);
        allData[sheet.title] = rows;
        console.log(`    ${sheet.title}: ${rows.length} rows`);
      }

      // Save per-script data
      const gidToTab = new Map<number, string>();
      for (const sheet of meta.sheets) {
        gidToTab.set(sheet.sheetId, sheet.title);
      }

      for (const script of scripts) {
        const scriptGid = parseInt(script.gid);
        const tabName = gidToTab.get(scriptGid);
        const safeName = script.scriptName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const outFile = path.join(OUTPUT_DIR, `${safeName}.json`);

        if (tabName && allData[tabName]) {
          fs.writeFileSync(outFile, JSON.stringify({
            scriptName: script.scriptName,
            sourceTab: tabName,
            rows: allData[tabName],
          }, null, 2));
          console.log(`  Saved: ${safeName}.json (${allData[tabName].length} rows from "${tabName}")`);
        }
      }
    }
  }

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
