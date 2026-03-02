/**
 * Shared Google Sheets API utilities.
 *
 * Extracted from update-tracking-sheet.ts, create-tracking-sheet.ts, and
 * add-summary-tab.ts to eliminate duplication.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

// ─── Sheet metadata ──────────────────────────────────────────────────────────

export async function getSheetTabs(
  accessToken: string,
  spreadsheetId: string,
): Promise<string[]> {
  const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get sheet tabs: ${res.status}`);
  const data = await res.json();
  return data.sheets.map((s: any) => s.properties.title);
}

export async function getSheetInfo(
  accessToken: string,
  spreadsheetId: string,
): Promise<{ tabs: string[]; sheetIds: Map<string, number> }> {
  const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Failed to get sheet info: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const tabs: string[] = [];
  const sheetIds = new Map<string, number>();
  for (const sheet of data.sheets) {
    tabs.push(sheet.properties.title);
    sheetIds.set(sheet.properties.title, sheet.properties.sheetId);
  }
  return { tabs, sheetIds };
}

// ─── Read tab data ───────────────────────────────────────────────────────────

export async function readSheetTab(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<string[][]> {
  const range = encodeURIComponent(`'${tabName}'`);
  const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.values || []).map((row: any[]) =>
    row.map((c: any) => (c == null ? '' : String(c))),
  );
}

// ─── Batch update cells ──────────────────────────────────────────────────────

export interface CellUpdate {
  range: string; // A1 notation, e.g. "'Core HR'!J5"
  value: string;
}

export async function batchUpdateCells(
  accessToken: string,
  spreadsheetId: string,
  updates: CellUpdate[],
): Promise<void> {
  const data = updates.map((u) => ({
    range: u.range,
    values: [[u.value]],
  }));

  // Batch in chunks of 500 cells
  for (let i = 0; i < data.length; i += 500) {
    const chunk = data.slice(i, i + 500);
    const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: chunk,
      }),
    });
    if (!res.ok) {
      throw new Error(`Batch update failed: ${res.status} ${await res.text()}`);
    }
  }
}

// ─── Tracking sheet ID ───────────────────────────────────────────────────────

export function getTrackingSheetId(): string {
  const idFilePath = path.resolve(process.cwd(), '.tracking-sheet-id');
  if (fs.existsSync(idFilePath)) {
    return fs.readFileSync(idFilePath, 'utf-8').trim();
  }
  return process.env.TRACKING_SHEET_ID || '';
}
