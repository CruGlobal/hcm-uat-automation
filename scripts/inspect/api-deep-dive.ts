import { chromium } from '@playwright/test';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const auth = Buffer.from('uat.bot_hr_admin:WinBuildSend!1951@cru').toString('base64');

async function get(page: any, endpoint: string) {
  const resp = await page.request.get(`${BASE_URL}${endpoint}`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
    timeout: 30000,
  });
  if (!resp.ok()) return { error: resp.status() };
  return resp.json();
}

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const personNum = '10817020';
  
  // 1. Worker expand=all — see ALL fields including nested
  console.log('=== Worker expand=all (all keys) ===');
  const worker = await get(page, `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNum}'&expand=all&onlyData=true`);
  if (worker.items?.[0]) {
    const w = worker.items[0];
    for (const [k, v] of Object.entries(w)) {
      if (k === 'links') continue;
      if (Array.isArray(v)) {
        console.log(`  ${k}: [${v.length} items]`);
        if (v[0]) console.log(`    keys: ${Object.keys(v[0]).filter(x => x !== 'links').join(', ')}`);
      } else {
        console.log(`  ${k}: ${JSON.stringify(v)?.slice(0, 80)}`);
      }
    }
  }
  
  // 2. Absences for a known person (search by PersonId)
  const personId = worker.items?.[0]?.PersonId;
  console.log(`\n=== Absences for PersonId ${personId} (first 3) ===`);
  const absences = await get(page, `/hcmRestApi/resources/latest/absences?q=personId=${personId}&limit=3&onlyData=true`);
  if (absences.items) {
    for (const a of absences.items.slice(0, 3)) {
      const keys = Object.keys(a).filter(k => k !== 'links');
      console.log(`  Absence: ${JSON.stringify(Object.fromEntries(keys.slice(0, 10).map(k => [k, a[k]])))?.slice(0, 200)}`);
    }
  } else {
    console.log('  No absences or error:', JSON.stringify(absences).slice(0, 200));
  }
  
  // 3. Element Entries for a known person
  console.log(`\n=== Element Entries for PersonId ${personId} (first 3) ===`);
  const entries = await get(page, `/hcmRestApi/resources/latest/elementEntries?q=PersonId=${personId}&limit=3&onlyData=true`);
  if (entries.items) {
    for (const e of entries.items.slice(0, 3)) {
      const keys = Object.keys(e).filter(k => k !== 'links');
      console.log(`  Entry: ${JSON.stringify(Object.fromEntries(keys.map(k => [k, e[k]])))?.slice(0, 200)}`);
    }
  } else {
    console.log('  No entries or error:', JSON.stringify(entries).slice(0, 200));
  }
  
  // 4. Try real person (10000034 = Sanders, Melburn from HR-138)
  console.log('\n=== Real person 10000034 (Sanders, Melburn) ===');
  const realWorker = await get(page, `/hcmRestApi/resources/latest/workers?q=PersonNumber='10000034'&expand=all&onlyData=true`);
  if (realWorker.items?.[0]) {
    const w = realWorker.items[0];
    console.log(`  PersonId: ${w.PersonId}, DisplayName: ${w.DisplayName}`);
    for (const [k, v] of Object.entries(w)) {
      if (Array.isArray(v) && v.length > 0) {
        console.log(`  ${k}: [${v.length} items]`);
        if (k === 'emails' || k === 'workRelationships') {
          console.log(`    Sample: ${JSON.stringify(v[0])?.slice(0, 200)}`);
        }
      }
    }
  }
  
  // 5. Try absence query with type filter
  console.log('\n=== Absences with filter (all, limit 5) ===');
  const allAbs = await get(page, `/hcmRestApi/resources/latest/absences?limit=5&orderBy=startDate:desc&onlyData=true`);
  if (allAbs.items) {
    console.log(`  Total returned: ${allAbs.items.length}`);
    for (const a of allAbs.items) {
      console.log(`  ${a.personId} | ${a.startDate} - ${a.endDate} | status=${a.absenceStatusCd} | approval=${a.approvalStatusCd}`);
    }
  }
  
  await browser.close();
}

main().catch(console.error);
