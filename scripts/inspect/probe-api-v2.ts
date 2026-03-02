/**
 * Probe Oracle HCM REST API endpoints — v2.
 * Tests three auth approaches:
 * 1. Session cookies only (from login)
 * 2. Basic Auth header only (no login)
 * 3. Both combined
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const CREDS = { username: 'uat.bot_hr_admin', password: 'WinBuildSend!1951@cru' };
const auth = Buffer.from(`${CREDS.username}:${CREDS.password}`).toString('base64');

async function directLogin(page: any) {
  console.log('Logging in as bot_hr_admin...');
  await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const userField = page.locator('#userid, input[name="userid"]').first();
  await userField.waitFor({ state: 'visible', timeout: 30000 });
  await userField.fill(CREDS.username);
  await page.locator('#password, input[name="password"]').first().fill(CREDS.password);
  await page.locator('#btnActive, button:has-text("Sign In"), input[type="submit"]').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Login successful. Current URL:', page.url());
}

async function testEndpoint(page: any, endpoint: string, desc: string, useBasicAuth: boolean) {
  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (useBasicAuth) {
    headers['Authorization'] = `Basic ${auth}`;
  }
  try {
    const resp = await page.request.get(url, { headers, timeout: 30000 });
    const status = resp.status();
    let extra = '';
    if (status === 200) {
      const json = await resp.json().catch(() => null);
      if (json?.items) {
        extra = ` (${json.items.length} items)`;
      } else if (json?.count !== undefined) {
        extra = ` (count: ${json.count})`;
      }
    }
    return { status, extra };
  } catch (e: any) {
    return { status: -1, extra: e.message?.slice(0, 60) };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const endpoint = `/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`;

  // Test 1: Basic Auth only (no login)
  console.log('--- Test 1: Basic Auth only (no login) ---');
  let r = await testEndpoint(page, endpoint, 'workers', true);
  console.log(`  Status: ${r.status} ${r.extra}`);

  // Test 2: Login then session cookies only (no Basic Auth)
  await directLogin(page);

  console.log('\n--- Test 2: Session cookies only (after login) ---');
  r = await testEndpoint(page, endpoint, 'workers', false);
  console.log(`  Status: ${r.status} ${r.extra}`);

  // Test 3: Session cookies + Basic Auth
  console.log('\n--- Test 3: Session cookies + Basic Auth ---');
  r = await testEndpoint(page, endpoint, 'workers', true);
  console.log(`  Status: ${r.status} ${r.extra}`);

  // Test 4: Use page.evaluate to make fetch from within the page context
  console.log('\n--- Test 4: fetch() from page context (session cookies) ---');
  try {
    const result = await page.evaluate(async (args: { url: string; auth: string }) => {
      // Try with session cookies only
      const r1 = await fetch(args.url, { headers: { Accept: 'application/json' }, credentials: 'include' });
      const s1 = r1.status;
      // Try with Basic Auth
      const r2 = await fetch(args.url, { headers: { Accept: 'application/json', Authorization: `Basic ${args.auth}` } });
      const s2 = r2.status;
      let body = '';
      if (s1 === 200) body = JSON.stringify((await r1.json()).items?.length);
      else if (s2 === 200) body = JSON.stringify((await r2.json()).items?.length);
      return { cookiesOnly: s1, basicAuth: s2, body };
    }, { url: `${BASE_URL}${endpoint}`, auth });
    console.log(`  Cookies only: ${result.cookiesOnly}, Basic Auth: ${result.basicAuth}, items: ${result.body}`);
  } catch (e: any) {
    console.log(`  Error: ${e.message?.slice(0, 100)}`);
  }

  // Test 5: Check cookies
  console.log('\n--- Cookies ---');
  const cookies = await ctx.cookies();
  const oracleCookies = cookies.filter((c: any) => c.domain.includes('oraclecloud'));
  console.log(`  Total cookies: ${cookies.length}, Oracle cookies: ${oracleCookies.length}`);
  for (const c of oracleCookies.slice(0, 10)) {
    console.log(`  ${c.name}: ${String(c.value).slice(0, 40)}... (domain: ${c.domain})`);
  }

  await browser.close();
}

main().catch(console.error);
