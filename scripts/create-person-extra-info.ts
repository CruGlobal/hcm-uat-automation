#!/usr/bin/env npx tsx
/**
 * Create Person Extra Information (Staff Account and Designation) records
 * in Oracle HCM for workers who are missing them.
 *
 * Uses: workers -> workersEFF -> PersonExtraInformationContextStaff__Account__and__DesignationprivateVO
 *
 * Usage:
 *   npx tsx scripts/create-person-extra-info.ts                    # Dry run (default)
 *   npx tsx scripts/create-person-extra-info.ts --apply            # Create missing records
 *   npx tsx scripts/create-person-extra-info.ts --person 10009865  # Check specific person
 */

import * as https from 'https';

const BASE_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const BOT_CREDS = { username: 'uat.bot_hr_admin', password: 'WinBuildSend!1951@cru' };
const CONTEXT = 'PersonExtraInformationContextStaff__Account__and__DesignationprivateVO';

// ── REST helper ──────────────────────────────────────────────────────

function hcmReq(method: string, endpoint: string, body?: any, extra?: Record<string, string>): Promise<any> {
  const url = `${BASE_URL}${endpoint}`;
  const auth = Buffer.from(`${BOT_CREDS.username}:${BOT_CREDS.password}`).toString('base64');
  const bodyStr = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const h: Record<string, string> = { Accept: 'application/json', Authorization: `Basic ${auth}`, 'REST-Framework-Version': '4', ...extra };
    if (bodyStr) { h['Content-Type'] = 'application/json'; h['Content-Length'] = String(Buffer.byteLength(bodyStr)); }
    const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, 30000);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: h }, res => {
      let raw = ''; res.on('data', (c: string) => raw += c); res.on('end', () => { clearTimeout(timer); let d; try { d = JSON.parse(raw); } catch { d = null; } resolve({ code: res.statusCode, data: d, raw }); });
    });
    req.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Main logic ───────────────────────────────────────────────────────

async function processWorker(w: any, apply: boolean): Promise<'has' | 'created' | 'failed' | 'skip'> {
  const selfLink = w.links?.find((l: any) => l.rel === 'self');
  if (!selfLink) return 'skip';
  const uid = selfLink.href.split('/workers/')[1];

  // Get EFF
  const effR = await hcmReq('GET', `/hcmRestApi/resources/latest/workers/${uid}/child/workersEFF?onlyData=false`);
  const eff = effR.data?.items?.[0];
  if (!eff) return 'skip';
  const effId = eff.links?.find((l: any) => l.rel === 'self')?.href.split('/workersEFF/')[1];

  // Check existing
  const ctxR = await hcmReq('GET', `/hcmRestApi/resources/latest/workers/${uid}/child/workersEFF/${effId}/child/${CONTEXT}?onlyData=true`);
  if ((ctxR.data?.items?.length || 0) > 0) return 'has';

  if (!apply) {
    console.log(`  ⊘ ${w.PersonNumber}: MISSING — would create`);
    return 'failed'; // count as "missing" in dry run
  }

  // Get hire date
  let hireDate = '2025-01-01';
  try {
    const wrR = await hcmReq('GET', `/hcmRestApi/resources/latest/workers/${uid}/child/workRelationships?onlyData=true&limit=1`);
    hireDate = wrR.data?.items?.[0]?.StartDate || hireDate;
  } catch {}

  // Create record
  const endpoint = `/hcmRestApi/resources/latest/workers/${uid}/child/workersEFF/${effId}/child/${CONTEXT}`;
  const createR = await hcmReq('POST', endpoint,
    { staffAccountNumber: 'new', designationNumber: 'new', primaryPerson: 'Y' },
    { 'Effective-Of': `RangeMode=CORRECTION;RangeStartDate=${hireDate}` }
  );

  if (createR.code >= 200 && createR.code < 300) {
    console.log(`  ✓ ${w.PersonNumber}: created (hireDate=${hireDate})`);
    return 'created';
  } else {
    console.log(`  ✗ ${w.PersonNumber}: ${createR.code} ${createR.raw?.slice(0, 200)}`);
    return 'failed';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const specificPerson = args.includes('--person') ? args[args.indexOf('--person') + 1] : null;

  console.log(apply ? '📝 APPLY MODE\n' : '🔍 DRY RUN (use --apply to create records)\n');

  let workers: any[] = [];

  if (specificPerson) {
    const r = await hcmReq('GET', `/hcmRestApi/resources/latest/workers?q=PersonNumber='${specificPerson}'&onlyData=false`);
    workers = r.data?.items || [];
  } else {
    // Fetch all workers with PersonNumber >= 10817000 (bot users + test-created employees)
    // Plus fetch in pages to cover all
    let offset = 0;
    const limit = 500;
    while (true) {
      const r = await hcmReq('GET', `/hcmRestApi/resources/latest/workers?q=PersonNumber>='10817000'&limit=${limit}&offset=${offset}&onlyData=false`);
      const items = r.data?.items || [];
      workers.push(...items);
      console.log(`  Fetched ${workers.length} workers...`);
      if (!r.data?.hasMore) break;
      offset += limit;
    }
  }

  console.log(`\nChecking ${workers.length} workers...\n`);

  let has = 0, created = 0, failed = 0, skipped = 0;

  for (let i = 0; i < workers.length; i++) {
    try {
      const result = await processWorker(workers[i], apply);
      if (result === 'has') has++;
      else if (result === 'created') created++;
      else if (result === 'failed') failed++;
      else skipped++;
    } catch (e: any) {
      console.log(`  ✗ ${workers[i].PersonNumber}: ${e.message?.split('\n')[0]}`);
      failed++;
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  ... ${i + 1}/${workers.length} processed`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Total workers: ${workers.length}`);
  console.log(`Already has record: ${has}`);
  if (apply) {
    console.log(`Created: ${created}`);
    console.log(`Failed: ${failed}`);
  } else {
    console.log(`Missing (would create): ${failed}`);
  }
  if (skipped) console.log(`Skipped: ${skipped}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
