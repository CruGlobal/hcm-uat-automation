/**
 * Probe Oracle HCM REST API — v3.
 * Test multiple credential formats and auth approaches.
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const PASSWORD = 'WinBuildSend!1951@cru';
const endpoint = `/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`;

async function testAuth(page: any, desc: string, username: string, password: string) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${BASE_URL}${endpoint}`;
  try {
    const resp = await page.request.get(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      timeout: 15000,
    });
    const status = resp.status();
    let extra = '';
    if (status === 200) {
      const json = await resp.json().catch(() => null);
      extra = json?.items ? ` (${json.items.length} items)` : '';
    } else if (status !== 401 && status !== 403) {
      extra = ` body: ${(await resp.text().catch(() => '')).slice(0, 100)}`;
    }
    console.log(`${status === 200 ? '✅' : '❌'} ${status} ${desc} (${username})${extra}`);
  } catch (e: any) {
    console.log(`❌ ERR ${desc}: ${e.message?.slice(0, 80)}`);
  }
}

async function testContextAuth(desc: string, username: string, password: string) {
  // Use Playwright's built-in httpCredentials for Basic Auth
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    httpCredentials: { username, password },
  });
  const page = await ctx.newPage();
  const url = `${BASE_URL}${endpoint}`;
  try {
    const resp = await page.request.get(url, {
      headers: { Accept: 'application/json' },
      timeout: 15000,
    });
    const status = resp.status();
    let extra = '';
    if (status === 200) {
      const json = await resp.json().catch(() => null);
      extra = json?.items ? ` (${json.items.length} items)` : '';
    }
    console.log(`${status === 200 ? '✅' : '❌'} ${status} ${desc} (httpCredentials: ${username})${extra}`);
  } catch (e: any) {
    console.log(`❌ ERR ${desc}: ${e.message?.slice(0, 80)}`);
  }
  await browser.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log('=== Test Basic Auth with different username formats ===');
  // Format 1: uat.bot_hr_admin (the login username)
  await testAuth(page, 'dotted username', 'uat.bot_hr_admin', PASSWORD);
  // Format 2: UAT.BOT_HR_ADMIN (uppercase)
  await testAuth(page, 'uppercase', 'UAT.BOT_HR_ADMIN', PASSWORD);
  // Format 3: bot_hr_admin (without uat. prefix)
  await testAuth(page, 'no prefix', 'bot_hr_admin', PASSWORD);
  // Format 4: BOT_HR_ADMIN (no prefix, uppercase)
  await testAuth(page, 'no prefix upper', 'BOT_HR_ADMIN', PASSWORD);

  // Also test with the default SSO/Okta user
  const ssoUser = process.env.ORACLE_HCM_USERNAME;
  const ssoPass = process.env.ORACLE_HCM_PASSWORD;
  if (ssoUser && ssoPass) {
    console.log(`\n=== Test with SSO user (${ssoUser}) ===`);
    await testAuth(page, 'SSO user', ssoUser, ssoPass);
  }

  // Test with httpCredentials context option
  console.log('\n=== Test httpCredentials context ===');
  await browser.close();
  await testContextAuth('httpCredentials', 'uat.bot_hr_admin', PASSWORD);

  // Test: Navigate to REST API URL directly in browser (like a GET request)
  console.log('\n=== Test direct navigation to REST endpoint ===');
  const browser2 = await chromium.launch({ headless: true });
  const ctx2 = await browser2.newContext();
  const page2 = await ctx2.newPage();

  // First login
  console.log('Logging in...');
  await page2.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const userField = page2.locator('#userid, input[name="userid"]').first();
  await userField.waitFor({ state: 'visible', timeout: 30000 });
  await userField.fill('uat.bot_hr_admin');
  await page2.locator('#password, input[name="password"]').first().fill(PASSWORD);
  await page2.locator('#btnActive').first().click();
  await page2.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Logged in.');

  // Try navigating directly to the REST API URL in the browser
  console.log('Navigating to REST endpoint...');
  const restUrl = `${BASE_URL}/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`;
  const response = await page2.goto(restUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`  Navigation status: ${response?.status()}`);
  console.log(`  Final URL: ${page2.url()}`);
  const bodyText = await page2.locator('body').textContent().catch(() => 'n/a');
  console.log(`  Body: ${bodyText?.slice(0, 300)}`);

  await browser2.close();
  console.log('\nDone.');
}

main().catch(console.error);
