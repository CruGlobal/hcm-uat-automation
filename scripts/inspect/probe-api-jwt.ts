/**
 * Probe Oracle HCM REST API using integration user with JWT auth.
 * Oracle Fusion Cloud REST APIs support:
 * 1. Basic Auth (username:password)
 * 2. JWT Bearer token (signed with private key)
 *
 * This script tries both Basic Auth and JWT for the integration user.
 */
import { chromium } from '@playwright/test';
import * as crypto from 'crypto';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const INT_USER = 'cru_oic_int_user';

// Private key for JWT signing
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDAhkYX1RnnZCZx
x+QLcTXXEmjGExaxxm+4Ozf9VFZ8m7sS61o8Zj6Uvlk/LDpuG67sjfdkkqVHJvNt
m1t+NC6YeywFTZD/hlJtjPNAGLI87lVEcPJWrlLeGyI1eG8AmU1hu53rDYEKfiBY
3RCxSPbhhLowagXOmwnWXinpQsc2Nxn7tKzA20wK8x6yGipqlDTVCIIMmTWhU1eG
RklacOh0DPGhUD7gP0IPEifvyvqZPYRP2X7dQzs8ckapUEfqgQQmSBOfgw8m6nbI
DfSBmd85gLUhjuyQlJ9kn52BUJ0AIdqvktd+oKBUAx5xTbi18DzrvdIojQqKbVK2
BoLSH8NxAgMBAAECggEAJGtiKBD+cPjPkveSyp1UZ4aKfmnPAbs9mBbPvSLup2zY
Qzh1XfajgQTPIjWuKfUfro0ejw50qJSUORhKAwJBDERErA4jz0qsHiArReVGFmOp
iqRpG3+nmm98laveJ7lYW5Qfx/7Ked8pJFZRWZApb7jpdc4gohhPEJfIiuFAiR8o
TG8i58Exr6mVT8jfcEY512CoYsBsFEFJzkSbx0Q2mVwFyyifvR5ELFC4kmf/hIO1
/ISJqfhlgkQmLcOyohObGShFSDdG5301fFUaSoawu+zaAp2NmR7+JzjH60yn+dNI
3RYu7+4hU1AIVA74uN30TaYrAtMO4AP/Um/Nif2jqQKBgQDjqXvhLyNimivFdwle
LJvLeyMjVHXhbjSChkw5bb1DObchK2lDIEX3T9V+v5g32URMumbbm38i1FCmeUJH
b5FxGgD0+PaKAJVGnVa94fGtxoHrdcvfvsrV/N5BVUyW6ymnwuxiPj+bakd1mncv
AvXhsLIdugqZWxxy/rw2fsJOnQKBgQDYfR9GpDUz75nuT64e03UuxFKW00u7mPc0
aLD5FCcGu4POuOaVNe7WYEXczHNFU10ZDzIa1kOteItXUWqN5DYjzftEBAw+eNBs
gNo+DgSIFL/+mIk85djgL/j3PINSN2L2XNOjY9pmpb+B+a116PuM7nKY2ssNJcyZ
APRAvuHl5QKBgHeCSeB84UNqkR24jjdcjXA0tM5gEP2E35XBMBRZkifPDV4hLsGp
GHFp/DXsF9kBecQZedNAfm3nLGsnbm6Xl67aqrPuWWU6RyJph9Zn3HmPojXbgWlz
+4B3nKiJQYpb6mMBhRtReAx6rwaCTpxkHnUaT3Yhalz0oiuPo3er9Q5VAoGAAikN
fNj6pvAHKzekVy5pBvRyloq5QMAAB4fb7EBlO033vMJfmrGVFpKTX+ayZ8izLyLV
ryrgNgTz7wUi+ROD7suJbF5V+PGfstV+WAwvw2PhnprLE85/YY1ZAK6b6OAgnrDC
c+j1Lv0McjGZp4mRqRBgGGJmkFUGO6ikx1igTHkCgYEAieeX7V5dy0mEMjnSGOk8
xX9MVsnE85uhaClh85I6P/fnaGs3sLtDpG8Tc+V7stc9f767htwZwYG1esUEWH7W
n8YeNoHN35yfGqEvjJOhEE/TCuMH4r1BotMG7k3cbsTdmU7aT22Z0gte0G2FRLIM
6LvVKhnDnLnn7RPoIgJ4ZZU=
-----END PRIVATE KEY-----`;

function base64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createJWT(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: username,
    sub: username,
    aud: BASE_URL,
    iat: now,
    exp: now + 3600,
    prn: username, // Oracle-specific: principal name
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), PRIVATE_KEY);
  return `${signingInput}.${base64url(signature)}`;
}

async function testEndpoint(page: any, endpoint: string, desc: string, headers: Record<string, string>) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const resp = await page.request.get(url, { headers, timeout: 30000 });
    const status = resp.status();
    let extra = '';
    if (status === 200) {
      const json = await resp.json().catch(() => null);
      if (json?.items) {
        extra = ` (${json.items.length} items`;
        if (json.items[0]) extra += `, keys: ${Object.keys(json.items[0]).filter((k: string) => k !== 'links').slice(0, 8).join(',')}`;
        extra += ')';
      }
    } else {
      const body = await resp.text().catch(() => '');
      if (body) extra = ` body: ${body.slice(0, 150)}`;
      const authHeader = resp.headers()['www-authenticate'] || '';
      if (authHeader) extra += ` www-auth: ${authHeader}`;
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

  const workersEp = `/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`;

  // Test 1: Basic Auth with integration user (no password — just username:)
  console.log('=== Test 1: Basic Auth — integration user (no password) ===');
  const authNoPwd = Buffer.from(`${INT_USER}:`).toString('base64');
  await testEndpoint(page, workersEp, 'workers (no pwd)', {
    Accept: 'application/json',
    Authorization: `Basic ${authNoPwd}`,
  });

  // Test 2: JWT Bearer token
  console.log('\n=== Test 2: JWT Bearer token ===');
  const jwt = createJWT(INT_USER);
  console.log(`JWT: ${jwt.slice(0, 50)}...${jwt.slice(-20)}`);
  await testEndpoint(page, workersEp, 'workers (JWT)', {
    Accept: 'application/json',
    Authorization: `Bearer ${jwt}`,
  });

  // Test 3: JWT with different subject formats
  console.log('\n=== Test 3: JWT with different subject formats ===');
  for (const sub of [INT_USER, `${INT_USER}@cru.org`, INT_USER.toUpperCase()]) {
    const token = createJWT(sub);
    await testEndpoint(page, workersEp, `workers (JWT sub=${sub})`, {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    });
  }

  // Test 4: If any auth works, probe all endpoints
  const jwt2 = createJWT(INT_USER);
  const resp = await page.request.get(`${BASE_URL}${workersEp}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${jwt2}` },
    timeout: 30000,
  });

  if (resp.status() === 200) {
    console.log('\n✅ JWT Auth works! Probing all module endpoints...\n');
    const authHeaders = { Accept: 'application/json', Authorization: `Bearer ${createJWT(INT_USER)}` };

    const endpoints: [string, string][] = [
      // Core HR
      ['/hcmRestApi/resources/latest/workers?limit=1&onlyData=true', 'workers'],
      ['/hcmRestApi/resources/latest/emps?limit=1&onlyData=true', 'emps'],
      // Absence
      ['/hcmRestApi/resources/latest/absences?limit=1&onlyData=true', 'absences'],
      ['/hcmRestApi/resources/latest/absenceTypes?limit=1&onlyData=true', 'absenceTypes'],
      // Payroll
      ['/hcmRestApi/resources/latest/elementEntries?limit=1&onlyData=true', 'elementEntries'],
      ['/hcmRestApi/resources/latest/payrollElementEntries?limit=1&onlyData=true', 'payrollElementEntries'],
      // Benefits
      ['/hcmRestApi/resources/latest/benefitEnrollments?limit=1&onlyData=true', 'benefitEnrollments'],
      ['/hcmRestApi/resources/latest/benefitEnrollmentOpportunities?limit=1&onlyData=true', 'benefitEnrollmentOpportunities'],
      ['/hcmRestApi/resources/latest/benefitGroups?limit=1&onlyData=true', 'benefitGroups'],
      ['/hcmRestApi/resources/latest/benefitPlansComparison?limit=1&onlyData=true', 'benefitPlansComparison'],
      ['/hcmRestApi/resources/latest/benefitOptionsLOV?limit=1&onlyData=true', 'benefitOptionsLOV'],
      ['/hcmRestApi/resources/latest/benefitPlanTypesLOV?limit=1&onlyData=true', 'benefitPlanTypesLOV'],
      ['/hcmRestApi/resources/latest/benefitPlansLOV?limit=1&onlyData=true', 'benefitPlansLOV'],
      ['/hcmRestApi/resources/latest/benefitProgramsLOV?limit=1&onlyData=true', 'benefitProgramsLOV'],
      // Compensation
      ['/hcmRestApi/resources/latest/salaries?limit=1&onlyData=true', 'salaries'],
      ['/hcmRestApi/resources/latest/eligiblePlansLOV?limit=1&onlyData=true', 'eligiblePlansLOV'],
      ['/hcmRestApi/resources/latest/salaryBasisLov?limit=1&onlyData=true', 'salaryBasisLov'],
      ['/hcmRestApi/resources/latest/compensationChanges?limit=1&onlyData=true', 'compensationChanges'],
      // Time & Labor
      ['/hcmRestApi/resources/latest/timecards?limit=1&onlyData=true', 'timecards'],
      ['/hcmRestApi/resources/latest/timeRecordGroups?limit=1&onlyData=true', 'timeRecordGroups'],
      ['/hcmRestApi/resources/latest/timeRecordEventRequests?limit=1&onlyData=true', 'timeRecordEventRequests'],
      ['/hcmRestApi/resources/latest/attendanceViolations?limit=1&onlyData=true', 'attendanceViolations'],
      // Journeys
      ['/hcmRestApi/resources/latest/journeys?limit=1&onlyData=true', 'journeys'],
      ['/hcmRestApi/resources/latest/allocatedChecklists?limit=1&onlyData=true', 'allocatedChecklists'],
      // Documents
      ['/hcmRestApi/resources/latest/personDocumentsOfRecord?limit=1&onlyData=true', 'personDocumentsOfRecord'],
      ['/hcmRestApi/resources/latest/workerDocumentsOfRecord?limit=1&onlyData=true', 'workerDocumentsOfRecord'],
      // Approvals
      ['/hcmRestApi/resources/latest/businessProcessApprovalUsers?limit=1&onlyData=true', 'businessProcessApprovalUsers'],
      // Lookups
      ['/hcmRestApi/resources/latest/commonLookupsLOV?limit=1&onlyData=true', 'commonLookupsLOV'],
      ['/hcmRestApi/resources/latest/rolesLOV?limit=1&onlyData=true', 'rolesLOV'],
      // Admin
      ['/hcmRestApi/resources/latest/userAccounts?limit=1&onlyData=true', 'userAccounts'],
    ];

    for (const [ep, desc] of endpoints) {
      // Create fresh JWT for each request to avoid expiry issues
      await testEndpoint(page, ep, desc, {
        Accept: 'application/json',
        Authorization: `Bearer ${createJWT(INT_USER)}`,
      });
    }
  } else {
    // Also try Basic Auth with integration user and password from the key
    console.log('\n=== Additional: Basic Auth with common passwords ===');
    for (const pwd of ['Welcome1', 'Welcome1!', INT_USER, '']) {
      const auth = Buffer.from(`${INT_USER}:${pwd}`).toString('base64');
      const r = await page.request.get(`${BASE_URL}${workersEp}`, {
        headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
        timeout: 15000,
      });
      if (r.status() === 200) {
        console.log(`✅ Basic Auth works with password: ${pwd || '(empty)'}`);
        break;
      } else {
        console.log(`❌ ${r.status()} Basic Auth (pwd=${pwd || '(empty)'})`);
      }
    }
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
