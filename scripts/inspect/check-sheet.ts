import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const TOKEN_URL = "https://oauth2.googleapis.com/token";
  // Automated tracking sheet
  const SHEET_ID = "1oJmPmQJbJPt61PLow6bPSmHmGOPZnS2edTHIICIKLo8";

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: "refresh_token",
    }),
  });
  const { access_token } = await res.json();

  // Get Summary tab
  const range = encodeURIComponent("'Summary'!A1:F20");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const tabRes = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  const tabData = await tabRes.json();
  const rows = tabData.values || [];
  for (const row of rows) {
    console.log(row.join(' | '));
  }
}
main();
