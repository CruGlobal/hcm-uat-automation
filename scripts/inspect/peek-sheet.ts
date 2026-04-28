#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv';
dotenv.config();

const SHEET_ID = '1ZvyHTqQhtMCwYompUZ6cI-h4BIqnj62rWSTeK2cckq8';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TAB = process.argv[2] || 'Core - rehires';
const MAX_ROWS = Number(process.argv[3] || 60);

async function main() {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  const { access_token } = await tokenRes.json();

  const range = encodeURIComponent(`'${TAB}'`);
  const url = `${SHEETS_API}/${SHEET_ID}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  const body = await res.json();
  const rows: string[][] = (body.values || []).map((r: any[]) => r.map((c: any) => (c == null ? '' : String(c))));

  console.log(`TAB: "${TAB}"  (${rows.length} rows, ${rows[0]?.length || 0} cols)`);
  console.log('---');
  for (let i = 0; i < Math.min(rows.length, MAX_ROWS); i++) {
    const row = rows[i];
    const preview = row.slice(0, 8).map((c) => (c.length > 30 ? c.substring(0, 30) + '…' : c)).join(' | ');
    console.log(`r${i}: ${preview}`);
  }
}
main().catch((e) => console.log('ERROR:', e.message));
