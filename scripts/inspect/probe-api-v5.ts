/**
 * Probe Oracle HCM REST API — v5.
 * Test with SSO user credentials and different username formats.
 * OWSM realm expects IDCS/Identity Domain credentials.
 */
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const SSO_USER = process.env.ORACLE_HCM_USERNAME || '';
const SSO_PASS = (process.env.ORACLE_HCM_PASSWORD || '').replace(/^["']|["']$/g, '');
const BOT_PASS = 'WinBuildSend!1951@cru';

const endpoint = `/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`;

async function testBasicAuth(page: any, desc: string, username: string, password: string) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `${BASE_URL}${endpoint}`;
  try {
    const resp = await page.request.get(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      timeout: 20000,
    });
    const status = resp.status();
    let extra = '';
    if (status === 200) {
      const json = await resp.json().catch(() => null);
      extra = json?.items ? ` — ${json.items.length} items, keys: ${Object.keys(json.items[0] || {}).filter(k => k !== 'links').slice(0, 5).join(',')}` : '';
    }
    console.log(`${status === 200 ? '✅' : '❌'} ${status} ${desc}${extra}`);
    return status;
  } catch (e: any) {
    console.log(`❌ ERR ${desc}: ${e.message?.slice(0, 80)}`);
    return -1;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log(`SSO user: ${SSO_USER}`);
  console.log(`SSO pass: ${SSO_PASS ? '***' + SSO_PASS.slice(-4) : '(empty)'}`);
  console.log(`Bot pass: ${BOT_PASS ? '***' + BOT_PASS.slice(-4) : '(empty)'}\n`);

  // Test SSO user with SSO password
  console.log('=== SSO User Credentials ===');
  await testBasicAuth(page, 'SSO email format', SSO_USER, SSO_PASS);
  // Try username without domain
  const userWithoutDomain = SSO_USER.split('@')[0];
  await testBasicAuth(page, 'SSO name only', userWithoutDomain, SSO_PASS);
  // Try uppercase
  await testBasicAuth(page, 'SSO upper', SSO_USER.toUpperCase(), SSO_PASS);

  // Test bot with SSO-style password (unlikely but worth trying)
  console.log('\n=== Bot with various formats ===');
  await testBasicAuth(page, 'bot uat.bot_hr_admin', 'uat.bot_hr_admin', BOT_PASS);
  await testBasicAuth(page, 'bot UAT.BOT_HR_ADMIN', 'UAT.BOT_HR_ADMIN', BOT_PASS);

  // Try the describe endpoint and catalog (sometimes these have different auth)
  console.log('\n=== Describe endpoints (metadata) ===');
  for (const [ep, desc] of [
    ['/hcmRestApi/resources/latest', 'REST catalog'],
    ['/hcmRestApi/resources/latest/workers/describe', 'workers describe'],
  ] as const) {
    const auth = Buffer.from(`${SSO_USER}:${SSO_PASS}`).toString('base64');
    const resp = await page.request.get(`${BASE_URL}${ep}`, {
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      timeout: 20000,
    });
    console.log(`${resp.status() === 200 ? '✅' : '❌'} ${resp.status()} ${desc}`);
    if (resp.status() === 200) {
      const body = await resp.text();
      console.log(`  ${body.slice(0, 300)}`);
    }
  }

  // If SSO user works, test all the module endpoints
  const ssoAuth = Buffer.from(`${SSO_USER}:${SSO_PASS}`).toString('base64');
  const testResp = await page.request.get(`${BASE_URL}${endpoint}`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${ssoAuth}` },
    timeout: 20000,
  });

  if (testResp.status() === 200) {
    console.log('\n=== SSO user WORKS! Testing all module endpoints ===');

    // Resolve PersonId
    const wData = await testResp.json();
    const personId = wData?.items?.[0]?.PersonId;
    const personNum = wData?.items?.[0]?.PersonNumber;
    console.log(`Sample worker: PersonId=${personId}, PersonNumber=${personNum}\n`);

    const endpoints = [
      ['/hcmRestApi/resources/latest/absences?limit=1&onlyData=true', 'absences'],
      ['/hcmRestApi/resources/latest/absenceTypes?limit=1&onlyData=true', 'absenceTypes'],
      ['/hcmRestApi/resources/latest/elementEntries?limit=1&onlyData=true', 'elementEntries'],
      ['/hcmRestApi/resources/latest/benefitEnrollments?limit=1&onlyData=true', 'benefitEnrollments'],
      ['/hcmRestApi/resources/latest/benefitEnrollmentOpportunities?limit=1&onlyData=true', 'benefitEnrollmentOpportunities'],
      ['/hcmRestApi/resources/latest/benefitGroups?limit=1&onlyData=true', 'benefitGroups'],
      ['/hcmRestApi/resources/latest/salaries?limit=1&onlyData=true', 'salaries'],
      ['/hcmRestApi/resources/latest/eligiblePlansLOV?limit=1&onlyData=true', 'eligiblePlansLOV'],
      ['/hcmRestApi/resources/latest/timecards?limit=1&onlyData=true', 'timecards'],
      ['/hcmRestApi/resources/latest/timeRecordGroups?limit=1&onlyData=true', 'timeRecordGroups'],
      ['/hcmRestApi/resources/latest/journeys?limit=1&onlyData=true', 'journeys'],
      ['/hcmRestApi/resources/latest/allocatedChecklists?limit=1&onlyData=true', 'allocatedChecklists'],
      ['/hcmRestApi/resources/latest/personDocumentsOfRecord?limit=1&onlyData=true', 'personDocumentsOfRecord'],
      ['/hcmRestApi/resources/latest/businessProcessApprovalUsers?limit=1&onlyData=true', 'businessProcessApprovalUsers'],
      ['/hcmRestApi/resources/latest/commonLookupsLOV?limit=1&onlyData=true', 'commonLookupsLOV'],
      ['/hcmRestApi/resources/latest/rolesLOV?limit=1&onlyData=true', 'rolesLOV'],
      ['/hcmRestApi/resources/latest/userAccounts?limit=1&onlyData=true', 'userAccounts'],
    ];

    for (const [ep, desc] of endpoints) {
      await testBasicAuth(page, desc, SSO_USER, SSO_PASS);
    }
  } else {
    console.log('\n❌ SSO user also returns 401. REST API may not be enabled for this tenant.');
    console.log('Possible fixes:');
    console.log('1. Enable Basic Auth in OWSM policy for REST APIs');
    console.log('2. Create an Integration User with REST API access');
    console.log('3. Configure OAuth 2.0 client credentials for API access');
  }

  await browser.close();
}

main().catch(console.error);
