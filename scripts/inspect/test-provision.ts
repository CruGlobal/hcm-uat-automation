import * as dotenv from 'dotenv';
dotenv.config();
import { resolveApiCredentials } from '../../src/validation/api-credentials';
import { provisionEmployeeLogin } from '../lib/hcm-rest-api';

const creds = resolveApiCredentials();
const baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';

async function main() {
  const personNumbers = ['10000621', '10000327', '10000090', '10000469'];
  for (const pn of personNumbers) {
    console.log(`\n--- Person ${pn} ---`);
    const result = await provisionEmployeeLogin(baseUrl, pn, undefined, creds);
    if (result) {
      console.log(`SUCCESS: ${result.username} (pw=${result.password})`);
    } else {
      console.log('FAILED');
    }
  }
}
main().catch(console.error);
