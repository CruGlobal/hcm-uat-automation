/**
 * Quick verification that the updated hcm-rest-api.ts works
 * with the new credentials (josh.starcher@cru.org).
 */
import {
  lookupPersonId,
  getWorkerFull,
  lookupAbsencesByNumber,
  lookupElementEntriesByNumber,
  lookupBenefitEnrollmentsByNumber,
  lookupSalariesByNumber,
  lookupTimeRecords,
  lookupAllocatedChecklistsByNumber,
} from '../lib/hcm-rest-api';

const BASE = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
const PERSON = '10000034'; // Sanders, Melburn

async function main() {
  console.log(`Testing API calls for person ${PERSON}...\n`);

  // 1. Worker lookup
  const worker = await lookupPersonId(null, BASE, PERSON);
  console.log(`✅ lookupPersonId: ${worker?.DisplayName} (PersonId: ${worker?.PersonId})`);

  // 2. Worker full
  const full = await getWorkerFull(null, BASE, PERSON);
  const relCount = full?.workRelationships?.length ?? 0;
  const emailCount = full?.emails?.length ?? 0;
  console.log(`✅ getWorkerFull: ${relCount} work rel(s), ${emailCount} email(s)`);

  // 3. Absences
  const absences = await lookupAbsencesByNumber(null, BASE, PERSON);
  console.log(`✅ lookupAbsencesByNumber: ${absences.length} absence(s)`);

  // 4. Element entries
  const entries = await lookupElementEntriesByNumber(null, BASE, PERSON);
  console.log(`✅ lookupElementEntriesByNumber: ${entries.length} element entry(ies)`);

  // 5. Benefit enrollments
  const enrollments = await lookupBenefitEnrollmentsByNumber(null, BASE, PERSON);
  console.log(`✅ lookupBenefitEnrollmentsByNumber: ${enrollments.length} enrollment(s)`);

  // 6. Salaries
  const salaries = await lookupSalariesByNumber(null, BASE, PERSON);
  console.log(`✅ lookupSalariesByNumber: ${salaries.length} salary record(s)`);
  if (salaries.length > 0) {
    console.log(`   Latest: ${salaries[0].CurrencyCode} ${salaries[0].SalaryAmount}`);
  }

  // 7. Time records
  const timeRecords = await lookupTimeRecords(null, BASE, PERSON);
  console.log(`✅ lookupTimeRecords: ${timeRecords.length} time record group(s)`);

  // 8. Journey checklists
  const checklists = await lookupAllocatedChecklistsByNumber(null, BASE, PERSON);
  console.log(`✅ lookupAllocatedChecklistsByNumber: ${checklists.length} checklist(s)`);

  console.log('\n🎉 All API calls successful!');
}

main().catch(e => {
  console.error(`❌ Error: ${e.message}`);
  process.exit(1);
});
