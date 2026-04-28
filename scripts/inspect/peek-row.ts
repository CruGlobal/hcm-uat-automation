#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv';
dotenv.config();
const SHEET_ID = '1ZvyHTqQhtMCwYompUZ6cI-h4BIqnj62rWSTeK2cckq8';
const TAB = process.argv[2] || 'Payroll';
const ROW = Number(process.argv[3] || 2);
async function main() {
  const t = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  const { access_token } = await t.json();
  const range = encodeURIComponent(`'${TAB}'`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${access_token}` } });
  const body = await r.json();
  const row = body.values[ROW] || [];
  console.log(`Row ${ROW} has ${row.length} cells. Non-empty:`);
  for (let i = 0; i < row.length; i++) {
    const v = (row[i] || '').toString().trim();
    if (v) console.log(`  col ${i}: "${v}"`);
  }
}
main().catch(e => console.log('ERROR:', e.message));
