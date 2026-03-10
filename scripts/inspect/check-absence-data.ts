import { loadUATModule, getFieldData } from '../../src/data/uat-plan-provider';
import { getField } from '../../src/data/test-data-provider';
const tests = loadUATModule('Absence Management');
let withPerson = 0, withoutPerson = 0, noFieldData = 0;
const missing: string[] = [];
for (const tc of tests) {
  const fd = getFieldData(tc.testId);
  if (fd === undefined) { noFieldData++; missing.push(tc.testId); continue; }
  const pn = getField(fd, 'person number') || getField(fd, 'personnumber');
  if (pn) withPerson++; else { withoutPerson++; missing.push(tc.testId + '(no-pn)'); }
}
console.log('Total:', tests.length);
console.log('With person number:', withPerson);
console.log('With field data but no person number:', withoutPerson);
console.log('No field data:', noFieldData);
console.log('Missing person# (sample):', missing.slice(0, 15).join(', '));
