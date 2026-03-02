/**
 * Log in as josh.starcher via SSO+MFA, then test REST API calls.
 * Uses the full Okta SSO flow with TOTP MFA.
 */
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TOTP } from 'otpauth';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = process.env.ORACLE_HCM_USERNAME || '';
const PASSWORD = (process.env.ORACLE_HCM_PASSWORD || '').replace(/^["']|["']$/g, '');
const TOTP_SECRET = process.env.OKTA_TOTP_SECRET || '';

async function ssoLogin(page: any) {
  console.log(`Logging in as ${USERNAME} via SSO+MFA...`);

  // Navigate to Oracle HCM
  await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Click "Company Single Sign-On"
  const ssoBtn = page.locator('#ssoBtn');
  await ssoBtn.waitFor({ state: 'visible', timeout: 30000 });
  await ssoBtn.click();
  await page.waitForLoadState('networkidle');

  // Okta — enter username
  const usernameField = page.locator('input[name="identifier"]');
  await usernameField.waitFor({ state: 'visible', timeout: 15000 });
  await usernameField.fill(USERNAME);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  // Okta — enter password
  const passwordField = page.locator('input[name="credentials.passcode"]');
  await passwordField.waitFor({ state: 'visible', timeout: 15000 });
  await passwordField.fill(PASSWORD);
  await page.locator('input[type="submit"]').click();
  await page.waitForLoadState('networkidle');

  // Okta — select Google Authenticator
  const gaSelect = page.locator('a[aria-label="Select Google Authenticator."]');
  await gaSelect.waitFor({ state: 'visible', timeout: 15000 });
  await gaSelect.click();
  await page.waitForLoadState('networkidle');

  // Okta — enter TOTP code
  const totp = new TOTP({ secret: TOTP_SECRET });
  const code = totp.generate();
  const mfaInput = page.locator('input[name="credentials.passcode"]');
  await mfaInput.waitFor({ state: 'visible', timeout: 15000 });
  await mfaInput.fill(code);
  await page.locator('input[type="submit"]').click();

  // Wait for HCM to load
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log(`Login successful. URL: ${page.url()}\n`);
}

async function probe(page: any, endpoint: string, desc: string, extraHeaders: Record<string, string> = {}): Promise<number> {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const resp = await page.request.get(url, {
      headers: { Accept: 'application/json', ...extraHeaders },
      timeout: 30000,
    });
    const status = resp.status();
    let extra = '';
    if (status === 200) {
      const json = await resp.json().catch(() => null);
      if (json?.items) {
        extra = ` (${json.items.length} items`;
        if (json.items[0]) extra += `, keys: ${Object.keys(json.items[0]).filter((k: string) => k !== 'links').slice(0, 8).join(',')}`;
        extra += ')';
      } else if (json?.count !== undefined) {
        extra = ` (count: ${json.count})`;
      }
    }
    const icon = status === 200 ? '✅' : status === 403 ? '🔒' : '❌';
    console.log(`${icon} ${status} ${desc}${extra}`);
    return status;
  } catch (e: any) {
    console.log(`❌ ERR ${desc}: ${e.message?.slice(0, 100)}`);
    return -1;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await ssoLogin(page);

  // Test 1: Session cookies only (no Basic Auth)
  console.log('=== Test: Session cookies only (no Basic Auth) ===');
  let status = await probe(page, '/hcmRestApi/resources/latest/workers?limit=1&onlyData=true', 'workers (cookies only)');

  // Test 2: Session cookies + Basic Auth with SSO user
  console.log('\n=== Test: Session cookies + Basic Auth ===');
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  status = await probe(page, '/hcmRestApi/resources/latest/workers?limit=1&onlyData=true', 'workers (cookies+basic)', {
    Authorization: `Basic ${auth}`,
  });

  // Test 3: Try XHR from page context (uses same-origin cookies)
  console.log('\n=== Test: fetch() from page context ===');
  const fetchResult = await page.evaluate(async (args: { base: string }) => {
    const endpoints = [
      '/hcmRestApi/resources/latest/workers?limit=1&onlyData=true',
      '/hcmRestApi/resources/latest/absences?limit=1&onlyData=true',
    ];
    const results: any[] = [];
    for (const ep of endpoints) {
      try {
        const resp = await fetch(`${args.base}${ep}`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        const body = resp.status === 200 ? await resp.text() : '';
        results.push({ ep, status: resp.status, bodyLen: body.length, preview: body.slice(0, 100) });
      } catch (e: any) {
        results.push({ ep, status: -1, error: e.message });
      }
    }
    return results;
  }, { base: BASE_URL });
  for (const r of fetchResult) {
    console.log(`${r.status === 200 ? '✅' : '❌'} ${r.status} ${r.ep.split('/').pop()?.split('?')[0]} ${r.preview || r.error || ''}`);
  }

  // If any worked, do a full probe
  const anyWorked = fetchResult.some((r: any) => r.status === 200) || status === 200;

  if (anyWorked) {
    console.log('\n✅ REST API accessible! Full endpoint probe:\n');
  } else {
    console.log('\n❌ REST API still not accessible via session. Trying navigate approach...\n');

    // Try navigating directly to REST endpoint in browser
    console.log('=== Navigate directly to REST endpoint ===');
    const navResp = await page.goto(`${BASE_URL}/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    console.log(`Status: ${navResp?.status()}`);
    const bodyText = await page.locator('body').textContent().catch(() => 'n/a');
    console.log(`Body: ${bodyText?.slice(0, 300)}`);

    // If navigate gives JSON, extract it
    if (navResp?.status() === 200) {
      console.log('\n✅ Direct navigation works! Testing all endpoints via navigation...');
    }
  }

  // Full endpoint probe (regardless of method)
  console.log('\n=== Full endpoint probe ===\n');

  // Determine which method works
  const useBasicAuth = status === 200;
  const headers = useBasicAuth ? { Authorization: `Basic ${auth}` } : {};

  console.log('--- Core HR ---');
  await probe(page, '/hcmRestApi/resources/latest/workers?limit=1&onlyData=true', 'workers', headers);
  await probe(page, '/hcmRestApi/resources/latest/emps?limit=1&onlyData=true', 'emps', headers);

  console.log('\n--- Absence ---');
  await probe(page, '/hcmRestApi/resources/latest/absences?limit=1&onlyData=true', 'absences', headers);
  await probe(page, '/hcmRestApi/resources/latest/absenceTypes?limit=1&onlyData=true', 'absenceTypes', headers);

  console.log('\n--- Payroll ---');
  await probe(page, '/hcmRestApi/resources/latest/elementEntries?limit=1&onlyData=true', 'elementEntries', headers);

  console.log('\n--- Benefits ---');
  await probe(page, '/hcmRestApi/resources/latest/benefitEnrollments?limit=1&onlyData=true', 'benefitEnrollments', headers);
  await probe(page, '/hcmRestApi/resources/latest/benefitEnrollmentOpportunities?limit=1&onlyData=true', 'benefitEnrollmentOpportunities', headers);
  await probe(page, '/hcmRestApi/resources/latest/benefitGroups?limit=1&onlyData=true', 'benefitGroups', headers);

  console.log('\n--- Compensation ---');
  await probe(page, '/hcmRestApi/resources/latest/salaries?limit=1&onlyData=true', 'salaries', headers);

  console.log('\n--- Time & Labor ---');
  await probe(page, '/hcmRestApi/resources/latest/timecards?limit=1&onlyData=true', 'timecards', headers);
  await probe(page, '/hcmRestApi/resources/latest/timeRecordGroups?limit=1&onlyData=true', 'timeRecordGroups', headers);

  console.log('\n--- Journeys ---');
  await probe(page, '/hcmRestApi/resources/latest/journeys?limit=1&onlyData=true', 'journeys', headers);
  await probe(page, '/hcmRestApi/resources/latest/allocatedChecklists?limit=1&onlyData=true', 'allocatedChecklists', headers);

  console.log('\n--- Documents ---');
  await probe(page, '/hcmRestApi/resources/latest/personDocumentsOfRecord?limit=1&onlyData=true', 'personDocumentsOfRecord', headers);

  console.log('\n--- Approvals ---');
  await probe(page, '/hcmRestApi/resources/latest/businessProcessApprovalUsers?limit=1&onlyData=true', 'businessProcessApprovalUsers', headers);

  console.log('\n--- Lookups ---');
  await probe(page, '/hcmRestApi/resources/latest/commonLookupsLOV?limit=1&onlyData=true', 'commonLookupsLOV', headers);
  await probe(page, '/hcmRestApi/resources/latest/rolesLOV?limit=1&onlyData=true', 'rolesLOV', headers);

  console.log('\n--- Admin ---');
  await probe(page, '/hcmRestApi/resources/latest/userAccounts?limit=1&onlyData=true', 'userAccounts', headers);

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
