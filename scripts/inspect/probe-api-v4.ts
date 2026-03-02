/**
 * Probe Oracle HCM REST API — v4.
 * Get full 401 response details (headers, body).
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const PASSWORD = 'WinBuildSend!1951@cru';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Login first
  console.log('Logging in...');
  await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const userField = page.locator('#userid, input[name="userid"]').first();
  await userField.waitFor({ state: 'visible', timeout: 30000 });
  await userField.fill('uat.bot_hr_admin');
  await page.locator('#password, input[name="password"]').first().fill(PASSWORD);
  await page.locator('#btnActive').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Logged in.\n');

  // Test 1: Full response from REST API with Basic Auth
  const endpoint = `/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`;
  const auth = Buffer.from(`uat.bot_hr_admin:${PASSWORD}`).toString('base64');
  console.log('=== REST API with Basic Auth ===');
  console.log(`Auth header: Basic ${auth.slice(0, 20)}...`);
  const resp1 = await page.request.get(`${BASE_URL}${endpoint}`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
    timeout: 30000,
  });
  console.log(`Status: ${resp1.status()} ${resp1.statusText()}`);
  const headers1 = resp1.headers();
  console.log('Response headers:');
  for (const [k, v] of Object.entries(headers1)) {
    console.log(`  ${k}: ${String(v).slice(0, 200)}`);
  }
  const body1 = await resp1.text().catch(() => '(empty)');
  console.log(`Body: ${body1.slice(0, 500)}`);

  // Test 2: REST API without any auth (just session cookies)
  console.log('\n=== REST API with session cookies only ===');
  const resp2 = await page.request.get(`${BASE_URL}${endpoint}`, {
    headers: { Accept: 'application/json' },
    timeout: 30000,
  });
  console.log(`Status: ${resp2.status()} ${resp2.statusText()}`);
  const body2 = await resp2.text().catch(() => '(empty)');
  console.log(`Body: ${body2.slice(0, 500)}`);

  // Test 3: Try describe endpoint (no data, just metadata)
  console.log('\n=== REST API describe ===');
  const resp3 = await page.request.get(`${BASE_URL}/hcmRestApi/resources/latest/workers/describe`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
    timeout: 30000,
  });
  console.log(`Status: ${resp3.status()}`);
  const body3 = await resp3.text().catch(() => '(empty)');
  console.log(`Body: ${body3.slice(0, 500)}`);

  // Test 4: Try accessing the REST catalog
  console.log('\n=== REST Catalog ===');
  const resp4 = await page.request.get(`${BASE_URL}/hcmRestApi/resources/latest`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
    timeout: 30000,
  });
  console.log(`Status: ${resp4.status()}`);
  const body4 = await resp4.text().catch(() => '(empty)');
  console.log(`Body: ${body4.slice(0, 500)}`);

  // Test 5: Try different API base paths
  console.log('\n=== Alternative API base paths ===');
  for (const basePath of [
    '/hcmRestApi/resources/11.13.18.05',
    '/hcmRestApi/resources/latest',
    '/fscmRestApi/resources/latest',
  ]) {
    const resp = await page.request.get(`${BASE_URL}${basePath}/workers?limit=1&onlyData=true`, {
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      timeout: 15000,
    });
    console.log(`${basePath}: ${resp.status()}`);
  }

  // Test 6: Try XMLHttpRequest from within the page (uses session cookies automatically)
  console.log('\n=== XMLHttpRequest from page context ===');
  const xhrResult = await page.evaluate(async (url: string) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText.slice(0, 300), headers: xhr.getAllResponseHeaders().slice(0, 300) });
      xhr.onerror = () => resolve({ status: -1, body: 'network error', headers: '' });
      xhr.send();
    });
  }, `${BASE_URL}${endpoint}`);
  console.log(`XHR result:`, JSON.stringify(xhrResult, null, 2));

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
