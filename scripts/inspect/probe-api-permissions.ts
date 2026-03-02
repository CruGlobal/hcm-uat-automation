/**
 * Probe Oracle HCM REST API endpoints to discover which ones
 * bot_hr_admin has access to (200) vs which return 403.
 *
 * This script first logs in via direct login to establish a session,
 * then probes each endpoint using Basic Auth.
 */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const CREDS = { username: 'uat.bot_hr_admin', password: 'WinBuildSend!1951@cru' };
const auth = Buffer.from(`${CREDS.username}:${CREDS.password}`).toString('base64');

async function directLogin(page: any) {
  console.log('Logging in as bot_hr_admin...');
  await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for login form
  const userField = page.locator('#userid, input[name="userid"], input[id="userid"]').first();
  await userField.waitFor({ state: 'visible', timeout: 30000 });
  await userField.fill(CREDS.username);
  await page.locator('#password, input[name="password"], input[id="password"]').first().fill(CREDS.password);
  await page.locator('#btnActive, button:has-text("Sign In"), input[type="submit"]').first().click();
  // Wait for HCM to load
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Login successful.\n');
}

interface ProbeResult {
  endpoint: string;
  desc: string;
  status: number;
  itemCount?: number;
  keys?: string[];
  error?: string;
}

async function probe(page: any, endpoint: string, desc: string): Promise<ProbeResult> {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const resp = await page.request.get(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      timeout: 30000,
    });
    const status = resp.status();
    let itemCount: number | undefined;
    let keys: string[] | undefined;

    if (status === 200) {
      const json = await resp.json().catch(() => null);
      if (json?.items) {
        itemCount = json.items.length;
        if (json.items[0]) {
          keys = Object.keys(json.items[0]).filter((k: string) => k !== 'links').slice(0, 10);
        }
      }
    }

    const icon = status === 200 ? '✅' : status === 403 ? '🔒' : '❌';
    const extra = status === 200 ? ` (${itemCount ?? '?'} items${keys ? ', keys: ' + keys.join(',') : ''})` : '';
    console.log(`${icon} ${status} ${desc}${extra}`);
    return { endpoint, desc, status, itemCount, keys };
  } catch (e: any) {
    console.log(`❌ ERR ${desc}: ${e.message?.slice(0, 100)}`);
    return { endpoint, desc, status: 0, error: e.message?.slice(0, 200) };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Step 1: Login to establish session
  await directLogin(page);

  // Known working person for queries
  const personNum = '10000034'; // Sanders, Melburn — a real person

  // Step 2: Resolve PersonId
  console.log('=== Resolving PersonId ===');
  const workerResult = await probe(page, `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNum}'&onlyData=true&limit=1`, 'workers (lookup)');

  let personId: number | null = null;
  try {
    const resp = await page.request.get(`${BASE_URL}/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNum}'&onlyData=true`, {
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
    });
    const data = await resp.json();
    personId = data?.items?.[0]?.PersonId;
    console.log(`PersonId for ${personNum}: ${personId}\n`);
  } catch {}

  // Step 3: Probe all endpoints

  // --- CORE HR (should work) ---
  console.log('=== CORE HR ===');
  await probe(page, `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNum}'&expand=all&onlyData=true&limit=1`, 'workers expand=all');
  await probe(page, `/hcmRestApi/resources/latest/emps?q=PersonNumber='${personNum}'&onlyData=true&limit=1`, 'emps');
  if (personId) {
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/emails?onlyData=true`, 'workers/emails');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/workRelationships?onlyData=true`, 'workers/workRelationships');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/assignments?onlyData=true`, 'workers/assignments');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/names?onlyData=true`, 'workers/names');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/addresses?onlyData=true`, 'workers/addresses');
  }

  // --- ABSENCE (should work) ---
  console.log('\n=== ABSENCE ===');
  await probe(page, `/hcmRestApi/resources/latest/absences?limit=1&onlyData=true`, 'absences');
  await probe(page, `/hcmRestApi/resources/latest/absenceTypes?limit=1&onlyData=true`, 'absenceTypes');
  if (personId) {
    await probe(page, `/hcmRestApi/resources/latest/absences?q=personId=${personId}&onlyData=true`, 'absences by PersonId');
  }

  // --- PAYROLL (should work) ---
  console.log('\n=== PAYROLL ===');
  if (personId) {
    await probe(page, `/hcmRestApi/resources/latest/elementEntries?q=PersonId=${personId}&onlyData=true`, 'elementEntries by PersonId');
  }
  await probe(page, `/hcmRestApi/resources/latest/elementEntries?limit=1&onlyData=true`, 'elementEntries');
  await probe(page, `/hcmRestApi/resources/latest/payrollElementEntries?limit=1&onlyData=true`, 'payrollElementEntries');

  // --- BENEFITS (likely 403) ---
  console.log('\n=== BENEFITS ===');
  await probe(page, `/hcmRestApi/resources/latest/benefitEnrollments?limit=1&onlyData=true`, 'benefitEnrollments');
  await probe(page, `/hcmRestApi/resources/latest/benefitsEnrollment?limit=1&onlyData=true`, 'benefitsEnrollment (alt spelling)');
  await probe(page, `/hcmRestApi/resources/latest/benefitEnrollmentOpportunities?limit=1&onlyData=true`, 'benefitEnrollmentOpportunities');
  await probe(page, `/hcmRestApi/resources/latest/benefitGroups?limit=1&onlyData=true`, 'benefitGroups');
  await probe(page, `/hcmRestApi/resources/latest/benefitPlansComparison?limit=1&onlyData=true`, 'benefitPlansComparison');
  await probe(page, `/hcmRestApi/resources/latest/benefitOptionsLOV?limit=1&onlyData=true`, 'benefitOptionsLOV');
  await probe(page, `/hcmRestApi/resources/latest/benefitPlanTypesLOV?limit=1&onlyData=true`, 'benefitPlanTypesLOV');
  await probe(page, `/hcmRestApi/resources/latest/benefitPlansLOV?limit=1&onlyData=true`, 'benefitPlansLOV');
  await probe(page, `/hcmRestApi/resources/latest/benefitProgramsLOV?limit=1&onlyData=true`, 'benefitProgramsLOV');

  // --- COMPENSATION (might work — HR Specialist has access to salaries) ---
  console.log('\n=== COMPENSATION ===');
  await probe(page, `/hcmRestApi/resources/latest/salaries?limit=1&onlyData=true`, 'salaries');
  if (personId) {
    // salaries filter by AssignmentId, not PersonId — try workers child
    await probe(page, `/hcmRestApi/resources/latest/salaries?q=PersonId=${personId}&onlyData=true`, 'salaries by PersonId');
  }
  await probe(page, `/hcmRestApi/resources/latest/eligiblePlansLOV?limit=1&onlyData=true`, 'eligiblePlansLOV');
  await probe(page, `/hcmRestApi/resources/latest/salaryBasisLov?limit=1&onlyData=true`, 'salaryBasisLov');
  await probe(page, `/hcmRestApi/resources/latest/compensationChanges?limit=1&onlyData=true`, 'compensationChanges');
  await probe(page, `/hcmRestApi/resources/latest/individualCompensation?limit=1&onlyData=true`, 'individualCompensation');

  // --- TIME & LABOR (likely 403) ---
  console.log('\n=== TIME & LABOR ===');
  await probe(page, `/hcmRestApi/resources/latest/timecards?limit=1&onlyData=true`, 'timecards');
  await probe(page, `/hcmRestApi/resources/latest/timeRecordGroups?limit=1&onlyData=true`, 'timeRecordGroups');
  await probe(page, `/hcmRestApi/resources/latest/timeRecordEventRequests?limit=1&onlyData=true`, 'timeRecordEventRequests');
  await probe(page, `/hcmRestApi/resources/latest/attendanceViolations?limit=1&onlyData=true`, 'attendanceViolations');

  // --- JOURNEYS (likely 403) ---
  console.log('\n=== JOURNEYS ===');
  await probe(page, `/hcmRestApi/resources/latest/journeys?limit=1&onlyData=true`, 'journeys');
  await probe(page, `/hcmRestApi/resources/latest/allocatedChecklists?limit=1&onlyData=true`, 'allocatedChecklists');

  // --- DOCUMENTS ---
  console.log('\n=== DOCUMENTS ===');
  await probe(page, `/hcmRestApi/resources/latest/personDocumentsOfRecord?limit=1&onlyData=true`, 'personDocumentsOfRecord');
  await probe(page, `/hcmRestApi/resources/latest/workerDocumentsOfRecord?limit=1&onlyData=true`, 'workerDocumentsOfRecord');

  // --- APPROVAL / SAA ---
  console.log('\n=== APPROVALS / SAA ===');
  await probe(page, `/hcmRestApi/resources/latest/businessProcessApprovalUsers?limit=1&onlyData=true`, 'businessProcessApprovalUsers');
  await probe(page, `/hcmRestApi/resources/latest/businessProcessNotifications?limit=1&onlyData=true`, 'businessProcessNotifications');

  // --- LOOKUPS ---
  console.log('\n=== LOOKUPS ===');
  await probe(page, `/hcmRestApi/resources/latest/commonLookupsLOV?q=LookupType='MAR_STATUS'&onlyData=true&limit=5`, 'commonLookupsLOV (MAR_STATUS)');
  await probe(page, `/hcmRestApi/resources/latest/rolesLOV?limit=1&onlyData=true`, 'rolesLOV');

  // --- MISC ---
  console.log('\n=== MISC ===');
  await probe(page, `/hcmRestApi/resources/latest/userAccounts?limit=1&onlyData=true`, 'userAccounts');

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
