/**
 * Probe ALL Oracle HCM REST API endpoints using working credentials.
 * josh.starcher@cru.org / WinBuildSend!1951@cru works for Basic Auth via OWSM.
 */
import * as https from 'https';

const BASE_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const USERNAME = 'josh.starcher@cru.org';
const PASSWORD = 'WinBuildSend!1951@cru';
const AUTH = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

function httpGet(endpoint: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(`${BASE_URL}${endpoint}`);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Basic ${AUTH}` },
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function probe(endpoint: string, desc: string): Promise<{ desc: string; status: number; items?: number; keys?: string[] }> {
  try {
    const { status, body } = await httpGet(endpoint);
    let items: number | undefined;
    let keys: string[] | undefined;
    if (status === 200 && body) {
      try {
        const json = JSON.parse(body);
        if (json?.items) {
          items = json.items.length;
          if (json.items[0]) keys = Object.keys(json.items[0]).filter(k => k !== 'links').slice(0, 10);
        }
      } catch {}
    }
    const icon = status === 200 ? '✅' : status === 403 ? '🔒' : status === 404 ? '📭' : '❌';
    const extra = status === 200 ? ` (${items ?? '?'} items${keys ? ', keys: ' + keys.join(',') : ''})` : '';
    console.log(`${icon} ${status} ${desc}${extra}`);
    return { desc, status, items, keys };
  } catch (e: any) {
    console.log(`❌ ERR ${desc}: ${e.message?.slice(0, 80)}`);
    return { desc, status: -1 };
  }
}

async function main() {
  console.log(`Using: ${USERNAME}\n`);

  // Also test if bot user works with email format
  console.log('=== Quick auth format test ===');
  for (const [user, desc] of [
    ['josh.starcher@cru.org', 'josh email'],
    ['josh.starcher', 'josh no domain'],
    ['JOSH.STARCHER@CRU.ORG', 'josh uppercase'],
    ['uat.bot_hr_admin', 'bot dotted'],
    ['uat.bot_hr_admin@cru.org', 'bot email format'],
  ] as const) {
    const auth = Buffer.from(`${user}:${PASSWORD}`).toString('base64');
    const u = new URL(`${BASE_URL}/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`);
    const result = await new Promise<number>((resolve, reject) => {
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      }, (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode || 0)); });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
    console.log(`${result === 200 ? '✅' : '❌'} ${result} ${desc} (${user})`);
  }

  console.log('\n=== Core HR ===');
  await probe('/hcmRestApi/resources/latest/workers?limit=1&onlyData=true', 'workers');
  await probe('/hcmRestApi/resources/latest/emps?limit=1&onlyData=true', 'emps');
  await probe('/hcmRestApi/resources/latest/workers?limit=1&expand=all&onlyData=true', 'workers expand=all');

  // Get a PersonId for child resource tests
  let personId: number | null = null;
  try {
    const { body } = await httpGet('/hcmRestApi/resources/latest/workers?limit=1&onlyData=true');
    personId = JSON.parse(body)?.items?.[0]?.PersonId;
    console.log(`  → PersonId: ${personId}`);
  } catch {}

  if (personId) {
    console.log('\n=== Worker Child Resources ===');
    await probe(`/hcmRestApi/resources/latest/workers/${personId}/child/emails?onlyData=true`, 'emails');
    await probe(`/hcmRestApi/resources/latest/workers/${personId}/child/workRelationships?onlyData=true`, 'workRelationships');
    await probe(`/hcmRestApi/resources/latest/workers/${personId}/child/assignments?onlyData=true`, 'assignments');
    await probe(`/hcmRestApi/resources/latest/workers/${personId}/child/names?onlyData=true`, 'names');
    await probe(`/hcmRestApi/resources/latest/workers/${personId}/child/addresses?onlyData=true`, 'addresses');
    await probe(`/hcmRestApi/resources/latest/workers/${personId}/child/legislativeInfo?onlyData=true`, 'legislativeInfo');
  }

  console.log('\n=== Absence ===');
  await probe('/hcmRestApi/resources/latest/absences?limit=1&onlyData=true', 'absences');
  await probe('/hcmRestApi/resources/latest/absenceTypes?limit=1&onlyData=true', 'absenceTypes');

  console.log('\n=== Payroll ===');
  await probe('/hcmRestApi/resources/latest/elementEntries?limit=1&onlyData=true', 'elementEntries');
  await probe('/hcmRestApi/resources/latest/payrollElementEntries?limit=1&onlyData=true', 'payrollElementEntries');
  await probe('/hcmRestApi/resources/latest/payrolls?limit=1&onlyData=true', 'payrolls');

  console.log('\n=== Benefits ===');
  await probe('/hcmRestApi/resources/latest/benefitEnrollments?limit=1&onlyData=true', 'benefitEnrollments');
  await probe('/hcmRestApi/resources/latest/benefitEnrollmentOpportunities?limit=1&onlyData=true', 'benefitEnrollmentOpportunities');
  await probe('/hcmRestApi/resources/latest/benefitGroups?limit=1&onlyData=true', 'benefitGroups');
  await probe('/hcmRestApi/resources/latest/benefitPlansComparison?limit=1&onlyData=true', 'benefitPlansComparison');
  await probe('/hcmRestApi/resources/latest/benefitOptionsLOV?limit=1&onlyData=true', 'benefitOptionsLOV');
  await probe('/hcmRestApi/resources/latest/benefitPlanTypesLOV?limit=1&onlyData=true', 'benefitPlanTypesLOV');
  await probe('/hcmRestApi/resources/latest/benefitPlansLOV?limit=1&onlyData=true', 'benefitPlansLOV');
  await probe('/hcmRestApi/resources/latest/benefitProgramsLOV?limit=1&onlyData=true', 'benefitProgramsLOV');

  console.log('\n=== Compensation ===');
  await probe('/hcmRestApi/resources/latest/salaries?limit=1&onlyData=true', 'salaries');
  await probe('/hcmRestApi/resources/latest/eligiblePlansLOV?limit=1&onlyData=true', 'eligiblePlansLOV');
  await probe('/hcmRestApi/resources/latest/salaryBasisLov?limit=1&onlyData=true', 'salaryBasisLov');

  console.log('\n=== Time & Labor ===');
  await probe('/hcmRestApi/resources/latest/timecards?limit=1&onlyData=true', 'timecards');
  await probe('/hcmRestApi/resources/latest/timeRecordGroups?limit=1&onlyData=true', 'timeRecordGroups');
  await probe('/hcmRestApi/resources/latest/timeRecordEventRequests?limit=1&onlyData=true', 'timeRecordEventRequests');
  await probe('/hcmRestApi/resources/latest/attendanceViolations?limit=1&onlyData=true', 'attendanceViolations');

  console.log('\n=== Journeys ===');
  await probe('/hcmRestApi/resources/latest/journeys?limit=1&onlyData=true', 'journeys');
  await probe('/hcmRestApi/resources/latest/allocatedChecklists?limit=1&onlyData=true', 'allocatedChecklists');

  console.log('\n=== Documents ===');
  await probe('/hcmRestApi/resources/latest/personDocumentsOfRecord?limit=1&onlyData=true', 'personDocumentsOfRecord');
  await probe('/hcmRestApi/resources/latest/workerDocumentsOfRecord?limit=1&onlyData=true', 'workerDocumentsOfRecord');

  console.log('\n=== Approvals / SAA ===');
  await probe('/hcmRestApi/resources/latest/businessProcessApprovalUsers?limit=1&onlyData=true', 'businessProcessApprovalUsers');
  await probe('/hcmRestApi/resources/latest/businessProcessNotifications?limit=1&onlyData=true', 'businessProcessNotifications');

  console.log('\n=== Lookups ===');
  await probe('/hcmRestApi/resources/latest/commonLookupsLOV?limit=1&onlyData=true', 'commonLookupsLOV');
  await probe('/hcmRestApi/resources/latest/rolesLOV?limit=1&onlyData=true', 'rolesLOV');

  console.log('\n=== Admin ===');
  await probe('/hcmRestApi/resources/latest/userAccounts?limit=1&onlyData=true', 'userAccounts');

  console.log('\n=== Additional Endpoints ===');
  await probe('/hcmRestApi/resources/latest/publicWorkers?limit=1&onlyData=true', 'publicWorkers');
  await probe('/hcmRestApi/resources/latest/assignmentChanges?limit=1&onlyData=true', 'assignmentChanges');
  await probe('/hcmRestApi/resources/latest/locations?limit=1&onlyData=true', 'locations');
  await probe('/hcmRestApi/resources/latest/departments?limit=1&onlyData=true', 'departments');
  await probe('/hcmRestApi/resources/latest/jobs?limit=1&onlyData=true', 'jobs');
  await probe('/hcmRestApi/resources/latest/grades?limit=1&onlyData=true', 'grades');
  await probe('/hcmRestApi/resources/latest/legalEntities?limit=1&onlyData=true', 'legalEntities');
  await probe('/hcmRestApi/resources/latest/businessUnits?limit=1&onlyData=true', 'businessUnits');

  console.log('\nDone.');
}

main().catch(console.error);
