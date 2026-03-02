import { lookupWorkerByName, hcmGet, type BasicAuthCredentials } from '../lib/hcm-rest-api';

const BASE = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const CREDS: BasicAuthCredentials = { username: 'josh.starcher@cru.org', password: 'WinBuildSend!1951@cru' };

async function main() {
  const name = process.argv[2] || 'HR-019';
  console.log(`Searching for worker by name: "${name}"`);

  // Try direct lookup
  const worker = await lookupWorkerByName(null, BASE, name, CREDS);
  console.log('lookupWorkerByName result:', worker);

  // Also try raw API search
  const encoded = encodeURIComponent(name);
  const endpoint = `/hcmRestApi/resources/latest/workers?q=DisplayName LIKE '*${encoded}*'&fields=PersonId,PersonNumber,DisplayName&onlyData=true&limit=5`;
  try {
    const data = await hcmGet(null, BASE, endpoint, CREDS);
    console.log('Raw API results:', JSON.stringify(data?.items?.map((i: any) => ({ PersonNumber: i.PersonNumber, DisplayName: i.DisplayName })), null, 2));
  } catch (e: any) {
    console.log('Raw API error:', e.message);
  }
}

main().catch(console.error);
