/**
 * Follow the tokenrelay redirect and try Oracle Fusion token relay flow.
 */
import * as https from 'https';
import * as crypto from 'crypto';

const BASE_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
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

function httpReq(
  method: string,
  url: string,
  body?: string,
  headers: Record<string, string> = {},
  followRedirects = false,
): Promise<{ status: number; body: string; headers: Record<string, string>; url: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { ...headers },
    };
    if (body) opts.headers!['Content-Length'] = Buffer.byteLength(body).toString();
    const req = https.request(opts, (res) => {
      if (followRedirects && (res.statusCode === 301 || res.statusCode === 302) && res.headers['location']) {
        const redirectUrl = res.headers['location'].startsWith('http')
          ? res.headers['location']
          : `https://${u.hostname}${res.headers['location']}`;
        httpReq(method, redirectUrl, body, headers, followRedirects).then(resolve).catch(reject);
        return;
      }
      let respBody = '';
      res.on('data', (d) => respBody += d);
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        body: respBody,
        headers: res.headers as Record<string, string>,
        url,
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function base64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  // 1. Follow the tokenrelay redirect
  console.log('=== 1. Follow tokenrelay redirect ===');
  const tr = await httpReq('GET', `${BASE_URL}/fscmRestApi/tokenrelay`, undefined, { Accept: 'application/json' });
  console.log(`Status: ${tr.status}`);
  console.log(`Location: ${tr.headers['location'] || '(none)'}`);
  console.log(`Body: ${tr.body.slice(0, 300)}`);

  // If redirect, follow it
  if (tr.headers['location']) {
    const redirectUrl = tr.headers['location'].startsWith('http')
      ? tr.headers['location']
      : `https://stafflife-icahjb-test.fa.ocs.oraclecloud.com${tr.headers['location']}`;
    console.log(`\nFollowing redirect to: ${redirectUrl}`);
    try {
      const tr2 = await httpReq('GET', redirectUrl, undefined, { Accept: 'application/json' });
      console.log(`Status: ${tr2.status}`);
      console.log(`Headers: ${JSON.stringify(tr2.headers).slice(0, 300)}`);
      console.log(`Body: ${tr2.body.slice(0, 500)}`);
    } catch (e: any) {
      console.log(`Error: ${e.message}`);
    }
  }

  // 2. Try BI Publisher token endpoint with credentials
  console.log('\n=== 2. BI Publisher Token (with Basic Auth) ===');
  const basicAuth = Buffer.from(`${INT_USER}:`).toString('base64');
  try {
    const biResp = await httpReq('GET', `${BASE_URL}/xmlpserver/services/rest/security/token`,
      undefined, { Accept: 'application/json', Authorization: `Basic ${basicAuth}` });
    console.log(`Status: ${biResp.status}`);
    console.log(`Body: ${biResp.body.slice(0, 300)}`);
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }

  // 3. Try the Oracle Fusion Cloud JWT User Assertion grant
  // This is Oracle's proprietary flow for integration users
  console.log('\n=== 3. JWT User Assertion via tokenrelay POST ===');
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = { alg: 'RS256', typ: 'JWT' };
  const jwtPayload = {
    prn: INT_USER,
    iss: INT_USER,
    sub: INT_USER,
    aud: `${BASE_URL}`,
    iat: now,
    exp: now + 300,
  };
  const headerB64 = base64url(JSON.stringify(jwtHeader));
  const payloadB64 = base64url(JSON.stringify(jwtPayload));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), PRIVATE_KEY);
  const jwt = `${headerB64}.${payloadB64}.${base64url(sig)}`;

  // Try POST to tokenrelay with JWT
  try {
    const formBody = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    const trPost = await httpReq('POST', `${BASE_URL}/fscmRestApi/tokenrelay`,
      formBody, { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' });
    console.log(`Status: ${trPost.status}`);
    console.log(`Body: ${trPost.body.slice(0, 500)}`);
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }

  // 4. Try Oracle's OWSM-specific JWT assertion flow
  // In OWSM, JWT tokens can be sent in the oracle/http_jwt_token_service_policy format
  console.log('\n=== 4. OWSM JWT via custom header ===');
  try {
    const r = await httpReq('GET',
      `${BASE_URL}/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`,
      undefined,
      {
        Accept: 'application/json',
        Authorization: `Bearer ${jwt}`,
        'X-Oracle-JWT-Token': jwt,
      },
    );
    console.log(`Status: ${r.status}`);
    console.log(`www-auth: ${r.headers['www-authenticate'] || 'none'}`);
    console.log(`Body: ${r.body.slice(0, 200)}`);
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }

  // 5. Check common IDCS/Identity Domain URL patterns
  console.log('\n=== 5. Check IDCS URL patterns ===');
  const domain = 'stafflife-icahjb-test';
  const possibleIdcsUrls = [
    `https://idcs-${domain}.identity.oraclecloud.com`,
    `https://${domain}.identity.oraclecloud.com`,
    `https://identity.oraclecloud.com`,
  ];
  for (const idcsUrl of possibleIdcsUrls) {
    try {
      const r = await httpReq('GET', `${idcsUrl}/.well-known/openid-configuration`, undefined, { Accept: 'application/json' });
      console.log(`${r.status} ${idcsUrl}`);
      if (r.status === 200) console.log(`  ${r.body.slice(0, 300)}`);
    } catch (e: any) {
      console.log(`ERR ${idcsUrl}: ${e.message?.slice(0, 50)}`);
    }
  }

  // 6. Try to access the REST API using cru_oic_int_user via Basic Auth
  // (perhaps password is empty or the same as username)
  console.log('\n=== 6. Try int user Basic Auth with various passwords ===');
  for (const pwd of ['', INT_USER, 'Oracle123', 'welcome1', 'Welcome123#']) {
    try {
      const auth = Buffer.from(`${INT_USER}:${pwd}`).toString('base64');
      const r = await httpReq('GET',
        `${BASE_URL}/hcmRestApi/resources/latest/workers?limit=1&onlyData=true`,
        undefined,
        { Accept: 'application/json', Authorization: `Basic ${auth}` },
      );
      if (r.status === 200) {
        console.log(`✅ ${r.status} pwd="${pwd}" WORKS!`);
        console.log(`  ${r.body.slice(0, 200)}`);
        break;
      } else {
        console.log(`❌ ${r.status} pwd="${pwd || '(empty)'}"`);
      }
    } catch (e: any) {
      console.log(`ERR pwd="${pwd}": ${e.message?.slice(0, 50)}`);
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
