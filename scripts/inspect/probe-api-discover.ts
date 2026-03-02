/**
 * Discover Oracle Identity Domain / IDCS URL from Fusion environment.
 * Then use JWT assertion to get an access token for REST API.
 */
import { chromium } from '@playwright/test';
import * as crypto from 'crypto';
import * as https from 'https';

const BASE_URL = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const INT_USER = 'cru_oic_int_user';
const PASSWORD = 'WinBuildSend!1951@cru';

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

function httpGet(url: string, headers: Record<string, string> = {}, followRedirects = true): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { ...headers },
    }, (res) => {
      if (followRedirects && (res.statusCode === 301 || res.statusCode === 302) && res.headers['location']) {
        httpGet(res.headers['location'], headers, followRedirects).then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers as Record<string, string> }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Step 1: Look at the login page for Identity Domain URL clues
  console.log('=== Step 1: Check login page for Identity Domain hints ===');
  await page.goto(`${BASE_URL}/fscmUI/faces/AtkHomePageWelcome`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Extract page source for IDCS/Identity Domain URLs
  const pageSource = await page.content();
  const idcsMatches = pageSource.match(/https?:\/\/[^"'\s]*identity[^"'\s]*/gi) || [];
  const oauthMatches = pageSource.match(/https?:\/\/[^"'\s]*oauth[^"'\s]*/gi) || [];
  const idcsMatches2 = pageSource.match(/https?:\/\/[^"'\s]*idcs[^"'\s]*/gi) || [];

  console.log('Identity URLs:', idcsMatches.slice(0, 5));
  console.log('OAuth URLs:', oauthMatches.slice(0, 5));
  console.log('IDCS URLs:', idcsMatches2.slice(0, 5));

  // Check all script/meta tags
  const allUrls = pageSource.match(/https?:\/\/[^"'\s<>]+/g) || [];
  const uniqueDomains = [...new Set(allUrls.map(u => { try { return new URL(u).hostname; } catch { return ''; } }).filter(Boolean))];
  console.log('\nDomains found in page:', uniqueDomains);

  // Step 2: Try the Security Console admin API
  console.log('\n=== Step 2: Login and check Settings → Security ===');
  const userField = page.locator('#userid, input[name="userid"]').first();
  await userField.waitFor({ state: 'visible', timeout: 30000 });
  await userField.fill('uat.bot_hr_admin');
  await page.locator('#password, input[name="password"]').first().fill(PASSWORD);
  await page.locator('#btnActive').first().click();
  await page.waitForURL('**/fscmUI/**', { timeout: 60000 });
  console.log('Logged in.');

  // Try to find IDCS URL from the running app
  const appSource = await page.content();
  const idcsSrc = appSource.match(/https?:\/\/[^"'\s]*idcs[^"'\s]*/gi) || [];
  const identitySrc = appSource.match(/https?:\/\/[^"'\s]*identity[^"'\s]*/gi) || [];
  console.log('IDCS in app:', idcsSrc.slice(0, 3));
  console.log('Identity in app:', identitySrc.slice(0, 3));

  // Step 3: Try Security Console URL
  console.log('\n=== Step 3: Try Security Console for IDCS discovery ===');
  try {
    const secResp = await page.goto(`${BASE_URL}/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_setup_and_maintenance`,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`Security Console: ${secResp?.status()}`);
  } catch (e: any) {
    console.log(`Security Console: ${e.message?.slice(0, 80)}`);
  }

  // Step 4: Try various token relay / token endpoint patterns
  console.log('\n=== Step 4: Try Fusion-specific auth endpoints ===');
  const fusionEndpoints = [
    `${BASE_URL}/fscmRestApi/tokenrelay`,
    `${BASE_URL}/hcmRestApi/tokenrelay`,
    `${BASE_URL}/fscmRestApi/auth/token`,
    `${BASE_URL}/interop/auth/token`,
    `${BASE_URL}/xmlpserver/services/rest/security/token`,
  ];

  for (const ep of fusionEndpoints) {
    try {
      const resp = await httpGet(ep, { Accept: 'application/json' }, false);
      console.log(`${resp.status} ${ep.replace(BASE_URL, '')}`);
      if (resp.body) console.log(`  ${resp.body.slice(0, 150)}`);
    } catch (e: any) {
      console.log(`ERR ${ep.replace(BASE_URL, '')}: ${e.message?.slice(0, 60)}`);
    }
  }

  // Step 5: Try using page.request (Playwright's API context) to check different auth patterns
  console.log('\n=== Step 5: Try OWSM-specific JWT Bearer format ===');
  // Oracle OWSM might need a specific JWT format with oracle-specific claims

  function base64url(data: Buffer | string): string {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Oracle-specific JWT with user assertion for OWSM
  const now = Math.floor(Date.now() / 1000);
  for (const issuer of [
    INT_USER,
    `www.oracle.com/oic/${INT_USER}`,
    BASE_URL,
  ]) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: issuer,
      prn: INT_USER,
      sub: INT_USER,
      aud: `${BASE_URL}/`,
      iat: now,
      exp: now + 3600,
      oracle_idp_user: INT_USER,
    };
    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), PRIVATE_KEY);
    const jwt = `${headerB64}.${payloadB64}.${base64url(sig)}`;

    const resp = await page.request.get(`${BASE_URL}/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${jwt}` },
      timeout: 15000,
    });
    console.log(`${resp.status()} JWT iss=${issuer.slice(0, 40)}`);
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
