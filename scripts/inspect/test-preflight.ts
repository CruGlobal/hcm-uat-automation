/**
 * Test the PreFlightChecker directly against real Oracle HCM data.
 *
 * Usage: npx tsx scripts/inspect/test-preflight.ts
 */
import { PreFlightChecker } from '../../src/validation/pre-flight-checker';
import { getWorkerFull, lookupWorkerByName, type BasicAuthCredentials } from '../lib/hcm-rest-api';
import type { UATTestCase } from '../../src/data/types';

const BASE = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const CREDS: BasicAuthCredentials = { username: 'josh.starcher@cru.org', password: 'WinBuildSend!1951@cru' };

function makeTc(overrides: Partial<UATTestCase>): UATTestCase {
  return {
    testId: 'TEST-001',
    module: 'Core HR',
    businessProcess: '',
    testScenario: '',
    transactionCategory: '',
    testScript: '',
    preConditions: '',
    testData: '',
    expectedResult: '',
    status: 'Passed',
    actualResult: '',
    testerName: '',
    alithyaContact: '',
    comments: '',
    testWeek: '',
    testDate: '',
    tabName: 'Core HR',
    ...overrides,
  };
}

async function main() {
  const checker = new PreFlightChecker();
  console.log('=== PreFlightChecker Integration Test ===\n');

  // Test 1: Hire test with existing person (HR-019 — already hired)
  console.log('--- Test 1: Hire — HR-019 (person already exists) ---');
  const hire = makeTc({ testId: 'HR-019', businessProcess: 'Hire Hourly Full Time Reg Employee' });
  const hireResult = await checker.prepare(hire);
  console.log(`  Result: ready=${hireResult.ready}, action="${hireResult.action}"`);
  console.log(`  Reason: ${hireResult.reason}`);
  console.log(`  Expected: ready=false, action="skipped" ✓=${!hireResult.ready && hireResult.action === 'skipped'}\n`);

  // Test 2: Termination test with active person (10000095 has active WR)
  console.log('--- Test 2: Termination — HR-479 (person is active) ---');
  const term = makeTc({ testId: 'HR-479', businessProcess: 'Voluntary Termination of Hourly Full Time Regular' });
  const termResult = await checker.prepare(term);
  console.log(`  Result: ready=${termResult.ready}, action="${termResult.action}"`);
  console.log(`  Reason: ${termResult.reason}`);
  console.log(`  Expected: ready=true, action="ok" ✓=${termResult.ready && termResult.action === 'ok'}\n`);

  // Test 3: Check person 10000095 state
  console.log('--- Test 3: Worker state verification ---');
  const worker = await getWorkerFull(null, BASE, '10000095', CREDS);
  if (worker) {
    const activeWRs = (worker.workRelationships || []).filter(wr => wr.TerminationDate === null);
    const termWRs = (worker.workRelationships || []).filter(wr => wr.TerminationDate !== null);
    console.log(`  Person 10000095: ${activeWRs.length} active WR, ${termWRs.length} terminated WR`);
  }

  // Test 4: Safe module (Benefits) — should return ok immediately
  console.log('\n--- Test 4: Benefits — BN-045 (safe module, no reset needed) ---');
  const benefits = makeTc({ testId: 'BN-045', module: 'Benefits', businessProcess: 'Absence Entry' });
  const bnResult = await checker.prepare(benefits);
  console.log(`  Result: ready=${bnResult.ready}, action="${bnResult.action}"`);
  console.log(`  Expected: ready=true, action="ok" ✓=${bnResult.ready && bnResult.action === 'ok'}\n`);

  // Test 5: Name search for hire person
  console.log('--- Test 5: Name lookup — "HR-019" exists in HCM ---');
  const found = await lookupWorkerByName(null, BASE, 'HR-019', CREDS);
  console.log(`  Found: ${found ? `${found.PersonNumber}: ${found.DisplayName}` : 'NOT FOUND'}`);
  console.log(`  Expected: found ✓=${!!found}\n`);

  console.log('=== All tests complete ===');
}

main().catch(console.error);
