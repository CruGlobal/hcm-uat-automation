import { chromium } from '@playwright/test';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const CREDS = { username: 'uat.bot_hr_admin', password: 'WinBuildSend!1951@cru' };

async function probe(page: any, endpoint: string, desc: string) {
  const url = `${BASE_URL}${endpoint}`;
  const auth = Buffer.from(`${CREDS.username}:${CREDS.password}`).toString('base64');
  try {
    const resp = await page.request.get(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      timeout: 30000,
    });
    const status = resp.status();
    let preview = '';
    if (status === 200) {
      const json = await resp.json().catch(() => null);
      if (json?.items) {
        preview = ` (${json.items.length} items`;
        if (json.items[0]) preview += `, keys: ${Object.keys(json.items[0]).filter((k: string) => k !== 'links').slice(0, 8).join(',')}`;
        preview += ')';
      }
      else if (json?.count !== undefined) preview = ` (count: ${json.count})`;
      else preview = ` (keys: ${Object.keys(json || {}).slice(0, 5).join(',')})`;
    }
    console.log(`${status === 200 ? 'OK' : 'NO'} ${status} ${desc}: ${endpoint.slice(0, 80)}${preview}`);
    return { status, desc, endpoint };
  } catch (e: any) {
    console.log(`NO ERR ${desc}: ${endpoint.slice(0, 80)} -- ${e.message?.slice(0, 80)}`);
    return { status: 0, desc, endpoint };
  }
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  
  const personNum = '10817020';
  
  console.log('=== Workers API ===');
  await probe(page, `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNum}'&onlyData=true`, 'Worker lookup');
  await probe(page, `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNum}'&expand=all&onlyData=true`, 'Worker expand=all');
  
  // Get PersonId
  const auth = Buffer.from(`${CREDS.username}:${CREDS.password}`).toString('base64');
  const wResp = await page.request.get(`${BASE_URL}/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNum}'&onlyData=true`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
  });
  const wData = await wResp.json();
  const personId = wData?.items?.[0]?.PersonId;
  console.log(`PersonId for ${personNum}: ${personId}\n`);
  
  if (personId) {
    console.log('=== Worker Child Resources ===');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/emails?onlyData=true`, 'Emails');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/phones?onlyData=true`, 'Phones');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/workRelationships?onlyData=true`, 'Work Relationships');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/assignments?onlyData=true`, 'Assignments');  
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/names?onlyData=true`, 'Names');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/addresses?onlyData=true`, 'Addresses');
    await probe(page, `/hcmRestApi/resources/latest/workers/${personId}/child/legislativeInfo?onlyData=true`, 'Legislative Info');
  }
  
  console.log('\n=== Standalone Endpoints ===');
  await probe(page, `/hcmRestApi/resources/latest/emps?limit=1&onlyData=true`, 'emps');
  await probe(page, `/hcmRestApi/resources/latest/absences?limit=1&onlyData=true`, 'absences');
  await probe(page, `/hcmRestApi/resources/latest/absenceTypes?limit=1&onlyData=true`, 'absenceTypes');
  await probe(page, `/hcmRestApi/resources/latest/benefitEnrollments?limit=1&onlyData=true`, 'benefitEnrollments');
  await probe(page, `/hcmRestApi/resources/latest/benefitsEnrollment?limit=1&onlyData=true`, 'benefitsEnrollment');
  await probe(page, `/hcmRestApi/resources/latest/elementEntries?limit=1&onlyData=true`, 'elementEntries');
  await probe(page, `/hcmRestApi/resources/latest/payrollElementEntries?limit=1&onlyData=true`, 'payrollElementEntries');
  await probe(page, `/hcmRestApi/resources/latest/personDocumentsOfRecord?limit=1&onlyData=true`, 'personDocumentsOfRecord');
  await probe(page, `/hcmRestApi/resources/latest/workerDocumentsOfRecord?limit=1&onlyData=true`, 'workerDocumentsOfRecord');
  await probe(page, `/hcmRestApi/resources/latest/timecards?limit=1&onlyData=true`, 'timecards');
  
  console.log('\n=== Employee Detail ===');
  if (personId) {
    await probe(page, `/hcmRestApi/resources/latest/emps/${personId}?expand=all&onlyData=true`, 'emp detail expand=all');
  }
  await probe(page, `/hcmRestApi/resources/latest/emps?q=PersonNumber='${personNum}'&expand=assignments&onlyData=true`, 'emp with assignments');
  
  console.log('\n=== Lookups ===');
  await probe(page, `/hcmRestApi/resources/latest/commonLookupsLOV?q=LookupType='MAR_STATUS'&onlyData=true&limit=5`, 'Marital Status LOV');
  await probe(page, `/hcmRestApi/resources/latest/commonLookupsLOV?q=LookupType='WORKER_TYPE'&onlyData=true&limit=5`, 'Worker Type LOV');
  
  await browser.close();
}

main().catch(console.error);
