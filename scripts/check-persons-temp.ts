import { getWorkerFull } from './lib/hcm-rest-api';

process.loadEnvFile('/home/ai/htdocs/hcm-uat-automation/.env');
const baseUrl = process.env.ORACLE_HCM_URL as string;
const creds = {
  username: (process.env.ORACLE_API_USERNAME || process.env.ORACLE_HCM_USERNAME) as string,
  password: (process.env.ORACLE_API_PASSWORD || process.env.ORACLE_HCM_PASSWORD) as string
};

const testIds = ['10000010', '10000036', '10000174'];
for (const pid of testIds) {
  const w = await getWorkerFull(null, baseUrl, pid, creds);
  if (w) {
    const wr = (w as any).workRelationships || [];
    const active = wr.filter((r: any) => !r.TerminationDate || r.TerminationDate === null);
    console.log(`${pid}: ${w.DisplayName || 'no name'} | WRs: ${wr.length} (${active.length} active)`);
  } else {
    console.log(`${pid}: NOT FOUND`);
  }
}
