#!/usr/bin/env npx tsx
/**
 * Data Cleanup: Create missing PERSON_EXTRA_NUMBER records for employees
 * with support_type (PEOPLE_GROUP) = SECA.
 *
 * These records should have:
 * - DESIGNATION_NUMBER = 'new'
 * - STAFF_ACCOUNT_NUMBER = 'new'
 * - PRIMARY_PERSON = 'Y'
 *
 * Usage:
 *   npx tsx scripts/fix-missing-person-extra-info.ts
 */
import oracledb from 'oracledb';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: path.resolve('/home/ai/htdocs/ohcm-data-conversion/.env') });

const DB_USER = 'migration';
const DB_PASS = process.env.DB_PASSWORD || 'Hs3[cU7*Qf9]zG4-hT5!Bn*Y';
const DB_DSN = 'erps1-scan.dbnpriv.prod.oraclevcn.com/hcmsapp.dbnpriv.prod.oraclevcn.com';

async function main() {
  try {
    oracledb.initOracleClient({ libDir: '/home/ai/oracle/instantclient_23_5' });
  } catch {
    // Already initialized
  }

  const conn = await oracledb.getConnection({
    user: DB_USER,
    password: DB_PASS,
    connectString: DB_DSN,
  });

  console.log('Step 1: Finding employees with SECA support type missing EIT records...');

  // Get list of persons with SECA support type that are missing EIT records
  const missingResult = await conn.execute<{ PERSON_NUM: string }>(
    `SELECT DISTINCT ca.PERSON_NUM
     FROM CONV_ASSIGNMENT_STRUCTURAL ca
     LEFT JOIN PERSON_EXTRA_NUMBER pen ON ca.PERSON_NUM = pen.PERSON_NUM
     WHERE ca.PEOPLE_GROUP = 'SECA'
     AND ca.EFFECTIVE_LATEST_CHANGE = 'Y'
     AND pen.PERSON_NUM IS NULL
     ORDER BY ca.PERSON_NUM`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const missingPersons = (missingResult.rows || []).map((r) => r.PERSON_NUM);
  console.log(`Found ${missingPersons.length} employees with SECA support type missing EIT records`);

  if (missingPersons.length === 0) {
    console.log('✓ All employees have required Person Extra Info records');
    await conn.close();
    return;
  }

  console.log('\nStep 2: Creating missing PERSON_EXTRA_NUMBER records...');

  let inserted = 0;
  let skipped = 0;

  for (const personNum of missingPersons) {
    try {
      const result = await conn.execute(
        `INSERT INTO PERSON_EXTRA_NUMBER
         (PERSON_NUM, EMPLID, EFFECTIVE_START_DT, EFFECTIVE_END_DT, INFORMATION_TYPE,
          PEI_INFORMATION_CATEGORY, DESIGNATION_NUMBER, STAFF_ACCOUNT_NUMBER, PRIMARY_PERSON)
         VALUES (:pnum, :pnum, SYSDATE, TO_DATE('4712-12-31', 'YYYY-MM-DD'),
                 'Person Extra Number', 'Person Extra Number', 'new', 'new', 'Y')`,
        { pnum: personNum },
        { autoCommit: true }
      );
      inserted++;
      if (inserted % 10 === 0) {
        process.stdout.write(`  ${inserted}...`);
      }
    } catch (e: unknown) {
      const error = e as Error;
      if (error.message.includes('unique constraint') || error.message.includes('ORA-00001')) {
        skipped++;
      } else {
        console.error(`\nFailed to insert for ${personNum}: ${error.message}`);
      }
    }
  }

  console.log(`\n✓ Successfully inserted ${inserted} records (${skipped} skipped - already exist)`);

  // Verify
  const verifyResult = await conn.execute<{ CNT: number }>(
    `SELECT COUNT(*) as CNT FROM PERSON_EXTRA_NUMBER WHERE DESIGNATION_NUMBER = 'new' AND STAFF_ACCOUNT_NUMBER = 'new'`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const newRecordCount = verifyResult.rows?.[0]?.CNT || 0;
  console.log(`\nTotal 'new' EIT records in DB: ${newRecordCount}`);

  await conn.close();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
