/**
 * Probe Oracle HCM REST API using OAuth2 JWT assertion flow.
 *
 * Oracle Fusion Cloud uses IDCS (Identity Cloud Service) for OAuth.
 * Flow: JWT assertion → IDCS token endpoint → access token → REST API
 */
import * as crypto from 'crypto';
import * as https from 'https';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const INT_USER = 'cru_oic_int_user';

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

function httpGet(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers as Record<string, string> }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpPost(url: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
    }, (res) => {
      let respBody = '';
      res.on('data', (d) => respBody += d);
      res.on('end', () => resolve({ status: res.statusCode || 0, body: respBody, headers: res.headers as Record<string, string> }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  // Step 1: Try to discover IDCS/Identity Domain endpoints
  console.log('=== Step 1: Discover OAuth endpoints ===');

  // Try well-known OpenID configuration
  const wellKnownUrls = [
    `${BASE_URL}/.well-known/openid-configuration`,
    `${BASE_URL}/oauth2/v1/.well-known/openid-configuration`,
    `https://login-stafflife-icahjb-test.fa.ocs.oraclecloud.com/.well-known/openid-configuration`,
    `https://login-stafflife-icahjb-test.fa.ocs.oraclecloud.com/oauth2/v1/.well-known/openid-configuration`,
  ];

  for (const wkUrl of wellKnownUrls) {
    try {
      const resp = await httpGet(wkUrl, { Accept: 'application/json' });
      console.log(`${resp.status} ${wkUrl.slice(0, 100)}`);
      if (resp.status === 200) {
        console.log(`  ${resp.body.slice(0, 500)}`);
      } else if (resp.status === 301 || resp.status === 302) {
        console.log(`  Redirect: ${resp.headers['location']}`);
      }
    } catch (e: any) {
      console.log(`ERR ${wkUrl.slice(0, 80)}: ${e.message?.slice(0, 60)}`);
    }
  }

  // Step 2: Try direct Basic Auth via https (bypassing Playwright)
  console.log('\n=== Step 2: Direct HTTPS Basic Auth ===');
  const auth = Buffer.from(`${INT_USER}:Welcome1`).toString('base64');
  const botAuth = Buffer.from('uat.bot_hr_admin:WinBuildSend!1951@cru').toString('base64');

  for (const [desc, authStr] of [
    ['int_user:Welcome1', auth],
    ['bot_hr_admin', botAuth],
  ] as const) {
    try {
      const resp = await httpGet(
        `${BASE_URL}/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`,
        { Accept: 'application/json', Authorization: `Basic ${authStr}` }
      );
      console.log(`${resp.status} ${desc}`);
      if (resp.status === 200) {
        console.log(`  BODY: ${resp.body.slice(0, 200)}`);
      } else if (resp.headers['www-authenticate']) {
        console.log(`  www-auth: ${resp.headers['www-authenticate']}`);
      }
      if (resp.status === 301 || resp.status === 302) {
        console.log(`  Redirect: ${resp.headers['location']}`);
      }
    } catch (e: any) {
      console.log(`ERR ${desc}: ${e.message?.slice(0, 80)}`);
    }
  }

  // Step 3: Try JWT assertion to FA OAuth endpoint
  console.log('\n=== Step 3: JWT assertion to token endpoints ===');

  const now = Math.floor(Date.now() / 1000);
  const tokenEndpoints = [
    `${BASE_URL}/oauth2/v1/token`,
    `https://login-stafflife-icahjb-test.fa.ocs.oraclecloud.com/oauth2/v1/token`,
    `${BASE_URL}/hcmRestApi/oauth2/v1/token`,
  ];

  for (const tokenUrl of tokenEndpoints) {
    // Create JWT for assertion
    const jwtHeader = { alg: 'RS256', typ: 'JWT' };
    const jwtPayload = {
      iss: INT_USER,
      sub: INT_USER,
      aud: tokenUrl,
      iat: now,
      exp: now + 3600,
    };
    const headerB64 = base64url(JSON.stringify(jwtHeader));
    const payloadB64 = base64url(JSON.stringify(jwtPayload));
    const sigInput = `${headerB64}.${payloadB64}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(sigInput), PRIVATE_KEY);
    const jwt = `${sigInput}.${base64url(sig)}`;

    const formBody = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString();

    try {
      const resp = await httpPost(tokenUrl, formBody, {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      });
      console.log(`${resp.status} ${tokenUrl}`);
      console.log(`  ${resp.body.slice(0, 300)}`);
    } catch (e: any) {
      console.log(`ERR ${tokenUrl.slice(0, 80)}: ${e.message?.slice(0, 80)}`);
    }
  }

  // Step 4: Check for OAM-based token endpoint
  console.log('\n=== Step 4: OAM token endpoint ===');
  try {
    const resp = await httpGet(`${BASE_URL}/oam/server/auth_cred_submit`, { Accept: 'application/json' });
    console.log(`${resp.status} OAM auth_cred_submit`);
    if (resp.headers['location']) console.log(`  Redirect: ${resp.headers['location']}`);
  } catch (e: any) {
    console.log(`ERR: ${e.message?.slice(0, 80)}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
