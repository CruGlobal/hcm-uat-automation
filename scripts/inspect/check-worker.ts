import { getWorkerFull } from '../lib/hcm-rest-api';
const BASE = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const CREDS = { username: 'josh.starcher@cru.org', password: 'WinBuildSend!1951@cru' };
const pn = process.argv[2] || '10000095';

async function main() {
  const w = await getWorkerFull(null, BASE, pn, CREDS);
  if (!w) { console.log('Worker not found'); return; }
  console.log('PersonId:', w.PersonId, 'Name:', w.DisplayName);
  for (const wr of w.workRelationships || []) {
    console.log('  WR:', wr.PeriodOfServiceId, 'Primary:', wr.PrimaryFlag, 'Start:', wr.StartDate, 'Term:', wr.TerminationDate);
  }
}
main().catch(e => console.error(e.message));
