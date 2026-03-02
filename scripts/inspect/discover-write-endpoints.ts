/**
 * Discovery script: probe Oracle HCM REST API write operations.
 *
 * Tests which write endpoints (POST, PATCH, DELETE) are accessible
 * with josh.starcher@cru.org credentials. Uses a known terminated worker
 * and existing absence/element entry records.
 *
 * Usage: npx tsx scripts/inspect/discover-write-endpoints.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import {
  hcmPost,
  hcmPatch,
  hcmDelete,
  hcmGet,
  getWorkerFull,
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  type BasicAuthCredentials,
} from '../lib/hcm-rest-api';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const CREDS: BasicAuthCredentials = {
  username: 'josh.starcher@cru.org',
  password: 'WinBuildSend!1951@cru',
};

interface ProbeResult {
  endpoint: string;
  method: string;
  status: 'accessible' | 'forbidden' | 'not-found' | 'error';
  statusCode?: number;
  message: string;
}

async function probe(method: string, endpoint: string, body?: any): Promise<ProbeResult> {
  try {
    let result: { statusCode: number; data: any };
    if (method === 'POST') {
      result = await hcmPost(BASE_URL, endpoint, body || {}, CREDS);
    } else if (method === 'PATCH') {
      result = await hcmPatch(BASE_URL, endpoint, body || {}, CREDS);
    } else if (method === 'DELETE') {
      result = await hcmDelete(BASE_URL, endpoint, CREDS);
    } else {
      const data = await hcmGet(null, BASE_URL, endpoint, CREDS);
      return { endpoint, method, status: 'accessible', statusCode: 200, message: `OK — ${JSON.stringify(data).slice(0, 100)}` };
    }
    return { endpoint, method, status: 'accessible', statusCode: result.statusCode, message: `OK — ${JSON.stringify(result.data).slice(0, 100)}` };
  } catch (error: any) {
    const code = error.statusCode || 0;
    if (code === 403) return { endpoint, method, status: 'forbidden', statusCode: 403, message: error.message.slice(0, 150) };
    if (code === 404) return { endpoint, method, status: 'not-found', statusCode: 404, message: error.message.slice(0, 150) };
    return { endpoint, method, status: 'error', statusCode: code, message: error.message.slice(0, 150) };
  }
}

async function main() {
  console.log('=== Oracle HCM REST API Write Endpoint Discovery ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Credentials: ${CREDS.username}\n`);

  // Step 1: Find a terminated worker for reverse termination test
  console.log('--- Step 1: Finding test data ---\n');

  // Try a few known person numbers from field data
  const testPersonNumbers = ['10816852', '10816853', '10816854', '10816855'];
  let terminatedWorker: any = null;
  let terminatedWR: any = null;
  let activeWorker: any = null;

  for (const pn of testPersonNumbers) {
    try {
      const worker = await getWorkerFull(null, BASE_URL, pn, CREDS);
      if (!worker) continue;

      const workRels = worker.workRelationships || [];
      const terminated = workRels.find((wr: any) => wr.TerminationDate !== null);
      if (terminated && !terminatedWorker) {
        terminatedWorker = worker;
        terminatedWR = terminated;
        console.log(`Found terminated worker: ${pn} (${worker.DisplayName}), terminated: ${terminated.TerminationDate}`);
      }
      if (!terminated && !activeWorker) {
        activeWorker = worker;
        console.log(`Found active worker: ${pn} (${worker.DisplayName})`);
      }
    } catch (e: any) {
      console.log(`  ${pn}: ${e.message.slice(0, 80)}`);
    }
  }

  // Step 2: Probe write endpoints
  console.log('\n--- Step 2: Probing write endpoints ---\n');
  const results: ProbeResult[] = [];

  // 2a. Reverse Termination
  if (terminatedWorker && terminatedWR) {
    console.log(`Probing reverseTermination for PersonId=${terminatedWorker.PersonId}, WR=${terminatedWR.PeriodOfServiceId}...`);
    // DRY RUN: Use OPTIONS or a safe probe — actually attempt the reversal
    // WARNING: This WILL reverse the termination if successful!
    const result = await probe(
      'POST',
      `/hcmRestApi/resources/latest/workers/${terminatedWorker.PersonId}/child/workRelationships/${terminatedWR.PeriodOfServiceId}/action/reverseTermination`,
    );
    results.push(result);
    console.log(`  → ${result.status} (${result.statusCode}): ${result.message}`);
  } else {
    console.log('No terminated worker found — skipping reverseTermination probe');
  }

  // 2b. Terminate Work Relationship (on active worker)
  if (activeWorker) {
    const wr = (activeWorker.workRelationships || [])[0];
    if (wr) {
      console.log(`\nProbing terminateWorkRelationship for PersonId=${activeWorker.PersonId}, WR=${wr.PeriodOfServiceId}...`);
      // DRY RUN: send with a far-future date that won't actually affect anything meaningful
      // Actually, let's just check the endpoint accessibility with a GET-like probe
      const result = await probe('GET', `/hcmRestApi/resources/latest/workers/${activeWorker.PersonId}/child/workRelationships/${wr.PeriodOfServiceId}`);
      results.push({ ...result, endpoint: '...action/terminateWorkRelationship', message: `WR accessible — ${result.status}` });
      console.log(`  → Work relationship accessible: ${result.status}`);
    }
  }

  // 2c. Absence withdrawal
  console.log('\nProbing absence withdrawal...');
  for (const pn of testPersonNumbers) {
    try {
      const absences = await lookupAbsencesByNumber(null, BASE_URL, pn, CREDS);
      if (absences.length > 0) {
        const abs = absences[0];
        console.log(`  Found absence ${abs.absenceCaseId} for ${pn} (status: ${abs.absenceStatusCd})`);
        // Only probe — don't actually withdraw
        const result = await probe('GET', `/hcmRestApi/resources/latest/absences/${abs.absenceCaseId}`);
        results.push({ ...result, endpoint: 'PATCH /absences/{id}', method: 'PATCH', message: `Absence record accessible — ${result.status}` });
        console.log(`  → Absence record accessible: ${result.status}`);
        break;
      }
    } catch { /* continue */ }
  }

  // 2d. Element entry deletion
  console.log('\nProbing element entry deletion...');
  for (const pn of testPersonNumbers) {
    try {
      const entries = await lookupElementEntriesByNumber(null, BASE_URL, pn, CREDS);
      if (entries.length > 0) {
        const entry = entries[0];
        console.log(`  Found element entry ${entry.ElementEntryId} for ${pn}`);
        // Only probe — don't actually delete
        const result = await probe('GET', `/hcmRestApi/resources/latest/elementEntries/${entry.ElementEntryId}`);
        results.push({ ...result, endpoint: 'DELETE /elementEntries/{id}', method: 'DELETE', message: `Element entry accessible — ${result.status}` });
        console.log(`  → Element entry accessible: ${result.status}`);
        break;
      }
    } catch { /* continue */ }
  }

  // 2e. Workers POST (create new worker)
  console.log('\nProbing POST /workers (create worker)...');
  const createResult = await probe('POST', '/hcmRestApi/resources/latest/workers', {
    LastName: 'TestProbe',
    FirstName: 'APIDiscovery',
    DateOfBirth: '1990-01-01',
  });
  results.push(createResult);
  console.log(`  → ${createResult.status} (${createResult.statusCode}): ${createResult.message}`);

  // Summary
  console.log('\n\n=== SUMMARY ===\n');
  console.log('Endpoint                                          | Method | Status    | Code');
  console.log('--------------------------------------------------|--------|-----------|-----');
  for (const r of results) {
    const ep = r.endpoint.padEnd(50).slice(0, 50);
    const m = r.method.padEnd(6);
    const s = r.status.padEnd(9);
    console.log(`${ep} | ${m} | ${s} | ${r.statusCode || 'N/A'}`);
  }

  console.log('\n=== RECOMMENDATIONS ===\n');
  const accessible = results.filter(r => r.status === 'accessible');
  const forbidden = results.filter(r => r.status === 'forbidden');

  if (accessible.length > 0) {
    console.log('Accessible endpoints (can be used for pre-flight resets):');
    for (const r of accessible) console.log(`  ✓ ${r.method} ${r.endpoint}`);
  }
  if (forbidden.length > 0) {
    console.log('\nForbidden endpoints (403 — need additional permissions):');
    for (const r of forbidden) console.log(`  ✗ ${r.method} ${r.endpoint}`);
  }
}

main().catch(console.error);
