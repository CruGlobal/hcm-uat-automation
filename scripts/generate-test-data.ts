#!/usr/bin/env npx tsx
/**
 * Generate test data from the migration database.
 *
 * Queries the Oracle migration schema (PERSON, CONV_ASSIGNMENT_STRUCTURAL,
 * PERSON_ADDRESS, SALARY_DEV, PAYROLL_ELEMENT_ENTRY, WORK_RELATIONSHIPS)
 * and generates realistic test cases in the same JSON format as the cached
 * Google Sheets data.
 *
 * Usage:
 *   npx tsx scripts/generate-test-data.ts              # Generate all tabs
 *   npx tsx scripts/generate-test-data.ts "Core - Hires"  # Generate one tab
 *
 * Output: writes to .cache-generated/*.json files
 *
 * This script uses the oracledb thin client + Oracle Instant Client (thick mode)
 * to connect to the migration database.
 */
import oracledb from 'oracledb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load migration DB credentials from the data-conversion project
dotenv.config({ path: path.resolve('/home/ai/htdocs/ohcm-data-conversion/.env') });

const DB_USER = 'migration';
const DB_PASS = process.env.DB_PASSWORD || 'Hs3[cU7*Qf9]zG4-hT5!Bn*Y';
const DB_DSN = 'erps1-scan.dbnpriv.prod.oraclevcn.com/hcmsapp.dbnpriv.prod.oraclevcn.com';

const OUTPUT_DIR = path.resolve(__dirname, '..', '.cache-generated');

interface TestCase {
  testId: string;
  tab: string;
  scenario: string;
  fields: Record<string, string>;
  columnIndex: number;
}

// ============================================================
// Value mappings: DB codes → Oracle HCM UI display values
// ============================================================
const GENDER_MAP: Record<string, string> = { M: 'Male', F: 'Female' };
const MARITAL_MAP: Record<string, string> = { S: 'Single', M: 'Married', D: 'Divorced', W: 'Widowed' };
const WORKER_TYPE_MAP: Record<string, string> = { E: 'Employee', N: 'Nonworker', P: 'Pending Worker' };
const FULL_PART_MAP: Record<string, string> = { FULL_TIME: 'Full Time', PART_TIME: 'Part Time' };
const REG_TEMP_MAP: Record<string, string> = { R: 'Regular', T: 'Temporary' };
const HOURLY_SALARY_MAP: Record<string, string> = { H: 'Hourly', S: 'Salary' };
const FREQUENCY_MAP: Record<string, string> = { W: 'Weekly', M: 'Monthly', A: 'Annually' };
const ASSIGNMENT_CATEGORY_MAP: Record<string, string> = {
  FT: 'Full-time regular', FR: 'Full-time regular', PT: 'Part-time regular',
  PR: 'Part-time regular', ON_CALL: 'On call',
};
const ASSIGNMENT_STATUS_MAP: Record<string, string> = {
  ACTIVE_PROCESS: 'Active - Payroll Eligible',
  ACTIVE_NO_PROCESS: 'Active - No Payroll',
  INACTIVE_NO_PROCESS: 'Inactive - No Payroll',
  INITIAL_SUPT_PROCESS: 'Raising Initial Support - Payroll Eligible',
  INITIAL_SUPT_NO_PROCESS: 'Raising Initial Support - No Payroll',
  PENDING_NO_PROCESS: 'Pending - No Payroll',
};
const EDUCATION_MAP: Record<string, string> = {
  BACHELOR: 'Bachelor', MASTERS: 'Masters', DOCTORAL: 'Doctoral',
  CA_10: 'Some High School', CA_20: 'High School Diploma', CA_80: 'Some College',
};
const PEOPLE_GROUP_MAP: Record<string, string> = {
  FICA: 'FICA', SECA: 'SECA', OPTOUT: 'None',
};
const ACTION_MAP: Record<string, string> = {
  HIRE: 'Hire', ADD_PEN_WKR: 'Add Pending Worker', TERMINATION: 'Termination',
  ASG_CHANGE: 'Assignment Change', TRANSFER: 'Transfer',
  CHANGE_SALARY: 'Change Salary', PAID_LEAVE: 'Paid Leave',
  JOB_CHANGE: 'Job Change',
};
const ACTION_REASON_MAP: Record<string, string> = {
  '': 'New Hire', NEW_HIRE: 'New Hire', PERSONAL: 'Personal',
  DISCHARGE: 'Discharge', TEAM_RELATION: 'Team Relationship',
  FICA: 'FICA Status Change', PAY_ADJUST: 'Pay Adjustment',
  PROMOTION: 'Promotion', POS_CHG: 'Position Change',
  TEMP_TO_REG: 'Temp to Regular', GRADE_CHANGE: 'Grade Change',
  NEW_SAL_CALC: 'New Salary Calculation', MGRREQ: 'Manager Request',
  '12MO_FT': '12MO_FT', FUTURE_HIRE: 'Future Hire',
  'TRANSFER DEPARTMENT': 'Transfer Department',
  'MIN TO MIN': 'Ministry to Ministry',
};
const SALARY_BASIS_MAP: Record<string, string> = {
  US_Hourly: 'US Hourly', US_Salaried: 'US Salaried',
  Supported_Staff_RMO: 'Supported Staff RMO',
};

// Addresses to use for test data (realistic US addresses)
const SAMPLE_ADDRESSES = [
  { line1: '100 Lake Hart Dr', city: 'Orlando', state: 'FL', zip: '32832', county: 'Orange' },
  { line1: '255 Glenstone Ave', city: 'Springfield', state: 'MO', zip: '65804', county: 'Greene' },
  { line1: '1234 Main St', city: 'Colorado Springs', state: 'CO', zip: '80903', county: 'El Paso' },
  { line1: '500 Technology Dr', city: 'San Jose', state: 'CA', zip: '95110', county: 'Santa Clara' },
  { line1: '1200 Lida St', city: 'Pasadena', state: 'CA', zip: '91103', county: 'Los Angeles' },
  { line1: '400 N Capitol St NW', city: 'Washington', state: 'DC', zip: '20001', county: 'District of Columbia' },
  { line1: '3100 Broadway Blvd', city: 'Kansas City', state: 'MO', zip: '64111', county: 'Jackson' },
  { line1: '777 S Flagler Dr', city: 'West Palm Beach', state: 'FL', zip: '33401', county: 'Palm Beach' },
  { line1: '200 Peachtree St NE', city: 'Atlanta', state: 'GA', zip: '30303', county: 'Fulton' },
  { line1: '1 Tower Ln', city: 'Oakbrook Terrace', state: 'IL', zip: '60181', county: 'DuPage' },
];

function dateToExcelSerial(dateStr: string): string {
  // dateStr format: YYYY/MM/DD from Oracle
  const d = new Date(dateStr);
  const epoch = new Date(1899, 11, 30); // Excel epoch
  const diff = d.getTime() - epoch.getTime();
  return String(Math.round(diff / (1000 * 60 * 60 * 24)));
}

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const epoch = new Date(1899, 11, 30);
  const diff = d.getTime() - epoch.getTime();
  return String(Math.round(diff / (1000 * 60 * 60 * 24)));
}

function generateSSN(index: number): string {
  // Generate fake SSN-like numbers (never real SSNs)
  const area = 900 + Math.floor(index / 1000) % 100; // 900-999 range (never issued)
  const group = (10 + index) % 100;
  const serial = (1000 + index) % 10000;
  return `${area}${String(group).padStart(2, '0')}${String(serial).padStart(4, '0')}`;
}

// ============================================================
// Data fetching from migration DB
// ============================================================
async function getConnection(): Promise<oracledb.Connection> {
  try {
    oracledb.initOracleClient({ libDir: '/home/ai/oracle/instantclient_23_5' });
  } catch {
    // Already initialized
  }
  return oracledb.getConnection({ user: DB_USER, password: DB_PASS, connectString: DB_DSN });
}

interface PersonRow {
  PERSON_NUMBER: string;
  FIRST_NAME: string;
  LAST_NAME: string;
  MIDDLE_NAME: string;
  GENDER: string;
  DATE_OF_BIRTH: string;
  MARITAL_STATUS: string;
  HIGHEST_EDUCATION_LEVEL: string;
  SUFFIX: string;
  STAFF_ACCOUNT_NUMBER: string;
  DESIGNATION_NUMBER: string;
}

interface AssignmentRow {
  PERSON_NUM: string;
  WORKER_TYPE: string;
  LEGAL_EMPLOYER: string;
  ASSIGNMENT_STATUS: string;
  ACTION: string;
  ACTION_REASON: string;
  PERSON_TYPE: string;
  BUSINESS_UNIT_SHORT_CODE: string;
  JOB: string;
  GRADE: string;
  DEPARTMENT: string;
  LOCATION: string;
  ASSIGNMENT_CATEGORY: string;
  FULL_TIME_OR_PART_TIME: string;
  PERMANENT_TEMPORARY: string;
  HOURLY_PAID_OR_SALARIED: string;
  WORKING_HOURS: string;
  FREQUENCY: string;
  PEOPLE_GROUP: string;
  MANAGER_PERSON_NUMBER: string;
  HIRE_DATE: string;
  TERMINATION_DATE: string;
}

interface AddressRow {
  PERSON_NUM: string;
  ADDRESS_LINE_1: string;
  ADDRESS_LINE_2: string;
  CITY: string;
  STATE: string;
  POSTAL_CODE: string;
  COUNTY: string;
}

interface SalaryRow {
  PERSONNUMBER: string;
  SALARYBASISNAME: string;
  SALARYAMOUNT: string;
}

interface WorkRelRow {
  PERSON_NUM: string;
  LEGAL_EMPLOYER: string;
  WORKER_TYPE: string;
  HIRE_DATE: string;
  TERMINATION_DATE: string;
}

interface PayrollEntryRow {
  ASSIGNMENT_NUMBER: string;
  ELEMENT_NAME: string;
  EFFECTIVE_START_DATE: string;
  INPUT_VALUE_NAME: string;
  SCREEN_ENTRY_VALUE: string;
}

async function fetchPersons(conn: oracledb.Connection, limit: number): Promise<PersonRow[]> {
  const result = await conn.execute<PersonRow>(
    `SELECT PERSON_NUMBER, FIRST_NAME, LAST_NAME, MIDDLE_NAME, GENDER,
            DATE_OF_BIRTH,
            MARITAL_STATUS, HIGHEST_EDUCATION_LEVEL, SUFFIX,
            STAFF_ACCOUNT_NUMBER, DESIGNATION_NUMBER
     FROM PERSON
     WHERE FIRST_NAME IS NOT NULL AND LAST_NAME IS NOT NULL AND DATE_OF_BIRTH IS NOT NULL
     AND ROWNUM <= :limit
     ORDER BY PERSON_NUMBER`,
    { limit: { val: limit, type: oracledb.NUMBER } },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []) as PersonRow[];
}

async function fetchAssignments(conn: oracledb.Connection, personNums: string[], action?: string): Promise<AssignmentRow[]> {
  if (personNums.length === 0) return [];
  const placeholders = personNums.map((_, i) => `:p${i}`).join(',');
  const binds: Record<string, string> = {};
  personNums.forEach((pn, i) => { binds[`p${i}`] = pn; });

  let whereAction = '';
  if (action) {
    whereAction = ` AND ACTION = :action`;
    binds.action = action;
  }

  const result = await conn.execute<AssignmentRow>(
    `SELECT PERSON_NUM, WORKER_TYPE, LEGAL_EMPLOYER, ASSIGNMENT_STATUS, ACTION, ACTION_REASON,
            PERSON_TYPE, BUSINESS_UNIT_SHORT_CODE, JOB, GRADE, DEPARTMENT, LOCATION,
            ASSIGNMENT_CATEGORY, FULL_TIME_OR_PART_TIME, PERMANENT_TEMPORARY,
            HOURLY_PAID_OR_SALARIED, WORKING_HOURS, FREQUENCY, PEOPLE_GROUP,
            MANAGER_PERSON_NUMBER, HIRE_DATE, TERMINATION_DATE
     FROM CONV_ASSIGNMENT_STRUCTURAL
     WHERE PERSON_NUM IN (${placeholders}) AND EFFECTIVE_LATEST_CHANGE = 'Y'${whereAction}
     ORDER BY PERSON_NUM`,
    binds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []) as AssignmentRow[];
}

async function fetchAddresses(conn: oracledb.Connection, personNums: string[]): Promise<AddressRow[]> {
  if (personNums.length === 0) return [];
  const placeholders = personNums.map((_, i) => `:p${i}`).join(',');
  const binds: Record<string, string> = {};
  personNums.forEach((pn, i) => { binds[`p${i}`] = pn; });

  const result = await conn.execute<AddressRow>(
    `SELECT PERSON_NUM, ADDRESS_LINE_1, ADDRESS_LINE_2, CITY, STATE, POSTAL_CODE, COUNTY
     FROM PERSON_ADDRESS
     WHERE PERSON_NUM IN (${placeholders}) AND PRIMARY_FLAG = 'Y'`,
    binds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []) as AddressRow[];
}

async function fetchSalaries(conn: oracledb.Connection, personNums: string[]): Promise<SalaryRow[]> {
  if (personNums.length === 0) return [];
  const placeholders = personNums.map((_, i) => `:p${i}`).join(',');
  const binds: Record<string, string | oracledb.BindParameters> = {};
  personNums.forEach((pn, i) => { binds[`p${i}`] = pn; });

  const result = await conn.execute<SalaryRow>(
    `SELECT PERSONNUMBER, SALARYBASISNAME, TO_CHAR(SALARYAMOUNT) AS SALARYAMOUNT
     FROM SALARY_DEV
     WHERE PERSONNUMBER IN (${placeholders})
     AND ROWNUM <= ${personNums.length}`,
    binds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []) as SalaryRow[];
}

async function fetchWorkRelationships(conn: oracledb.Connection, personNums: string[]): Promise<WorkRelRow[]> {
  if (personNums.length === 0) return [];
  const placeholders = personNums.map((_, i) => `:p${i}`).join(',');
  const binds: Record<string, string> = {};
  personNums.forEach((pn, i) => { binds[`p${i}`] = pn; });

  const result = await conn.execute<WorkRelRow>(
    `SELECT PERSON_NUM, LEGAL_EMPLOYER, WORKER_TYPE,
            TO_CHAR(HIRE_DATE, 'YYYY/MM/DD') AS HIRE_DATE,
            CASE WHEN TERMINATION_DATE IS NOT NULL THEN TO_CHAR(TERMINATION_DATE, 'YYYY/MM/DD') ELSE NULL END AS TERMINATION_DATE
     FROM WORK_RELATIONSHIPS
     WHERE PERSON_NUM IN (${placeholders})`,
    binds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []) as WorkRelRow[];
}

// ============================================================
// Test case generators per tab
// ============================================================

function makeHireCase(
  index: number, person: PersonRow, asg: AssignmentRow,
  addr: AddressRow | undefined, salary: SalaryRow | undefined,
  managerName: string
): TestCase {
  const testId = `GEN-H-${String(index).padStart(3, '0')}`;
  const personType = asg.PERSON_TYPE || 'Employee - Staff';
  const scenario = personType.replace('Employee - ', '');
  const addrData = addr || SAMPLE_ADDRESSES[index % SAMPLE_ADDRESSES.length];
  const hireDate = futureDate(30 + index); // future date for new hires

  const fields: Record<string, string> = {
    'When': hireDate,
    'Legal Employer': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    "What's the way": 'Hire',
    'Why': ACTION_REASON_MAP[asg.ACTION_REASON] || 'New Hire',
    'Business Unit': asg.BUSINESS_UNIT_SHORT_CODE || 'Cru',
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': dateToExcelSerial(person.DATE_OF_BIRTH),
    'Personal Details > National ID': generateSSN(index),
    'Personal Details > National ID Type': 'Social Security Number',
    'Legistlative > Gender': GENDER_MAP[person.GENDER] || 'Male',
    'Legistlative > Marital Status': MARITAL_MAP[person.MARITAL_STATUS] || 'Single',
    'Addresses > Address Line 1': 'ADDRESS_LINE_1' in addrData ? (addrData as AddressRow).ADDRESS_LINE_1 : (addrData as typeof SAMPLE_ADDRESSES[0]).line1,
    'Addresses > City': 'CITY' in addrData ? (addrData as AddressRow).CITY : (addrData as typeof SAMPLE_ADDRESSES[0]).city,
    'Addresses > State': 'STATE' in addrData ? (addrData as AddressRow).STATE : (addrData as typeof SAMPLE_ADDRESSES[0]).state,
    'Addresses > ZIP Code': 'POSTAL_CODE' in addrData ? (addrData as AddressRow).POSTAL_CODE : (addrData as typeof SAMPLE_ADDRESSES[0]).zip,
    'Addresses > County': 'COUNTY' in addrData ? (addrData as AddressRow).COUNTY : (addrData as typeof SAMPLE_ADDRESSES[0]).county,
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - Payroll Eligible',
    'Assignment > Person Type': personType,
    'Assignment > Job': asg.JOB || 'New Staff Raising Support',
    'Assignment > Grade': asg.GRADE || 'Not Graded',
    'Assignment > Department': asg.DEPARTMENT || 'Conversion Department',
    'Assignment > Location': asg.LOCATION || 'CRU_HQ',
    'Assignment > Assignment Category': ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || 'Full-time regular',
    'Assignment > Reg/Temp': REG_TEMP_MAP[asg.PERMANENT_TEMPORARY] || 'Regular',
    'Assignment > Full time or Part Time': FULL_PART_MAP[asg.FULL_TIME_OR_PART_TIME] || 'Full Time',
    'Assignment > Hourly Salary': HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || 'Salary',
    'Assignment > Working hours': asg.WORKING_HOURS || '40',
    'Assignment > Frequency': FREQUENCY_MAP[asg.FREQUENCY] || 'Weekly',
    'Assignment > Peoplegroup - Support Type': PEOPLE_GROUP_MAP[asg.PEOPLE_GROUP] || 'None',
    'Assignment > Peoplegroup - Seca Status': asg.PEOPLE_GROUP || 'FICA',
    'Managers > Manager': managerName || 'Kelly Murray',
    'Managers > Manager Type': 'Line Manager',
    'Payroll Details > Tax reporting Unit': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    'Payroll Details > Time Card required': asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'Y' : 'N',
  };

  // Salary info
  if (salary) {
    fields['Salary > Salary Basis'] = SALARY_BASIS_MAP[salary.SALARYBASISNAME] || salary.SALARYBASISNAME;
    fields['Salary > Salary'] = salary.SALARYAMOUNT || '30';
  } else {
    fields['Salary > Salary Basis'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'US Hourly' : 'US Salaried';
    fields['Salary > Salary'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? '15' : '50000';
  }

  // Payroll frequency based on type
  if (asg.HOURLY_PAID_OR_SALARIED === 'H') {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Hourly';
  } else if (asg.PEOPLE_GROUP === 'SECA') {
    fields['Payroll Details > Payroll Frequency'] = 'Semimonthly Supported';
  } else {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Salaried';
  }

  return { testId, tab: 'Core - Hires', scenario, fields, columnIndex: index + 2 };
}

function makeAddPendingWorkerCase(
  index: number, person: PersonRow, asg: AssignmentRow,
  addr: AddressRow | undefined
): TestCase {
  const testId = `GEN-APW-${String(index).padStart(3, '0')}`;
  const scenario = (asg.PERSON_TYPE || 'Pending - Staff').replace('Pending - ', '') + ' Applicant';
  const startDate = futureDate(60 + index);

  const fields: Record<string, string> = {
    'When and Why > Proposed Start Date': startDate,
    'When and Why > Proposed Worker type': WORKER_TYPE_MAP[asg.WORKER_TYPE] || 'Employee',
    'When and Why > Legal Employer': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    'When and Why > What': 'Add Pending Worker',
    'When and Why > Why': 'Future Hire',
    'When and Why > Business Unit': asg.BUSINESS_UNIT_SHORT_CODE || 'Cru',
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': dateToExcelSerial(person.DATE_OF_BIRTH),
    'Personal Details > National ID Type': 'Social Security Number',
    'Personal Details > National ID': generateSSN(1000 + index),
    'Legistlative Details > Marital Status': MARITAL_MAP[person.MARITAL_STATUS] || 'Single',
    'Addresses > Address': 'Any valid address',
    'Assignment > Assignment Status': 'Pending - No Payroll',
    'Assignment > Person Type': asg.PERSON_TYPE || 'Pending Staff',
    'Assignment > Proposed Person type': (asg.PERSON_TYPE || 'Employee - Staff').replace('Pending - ', 'Employee - '),
    'Assignment > Job': asg.JOB || 'New Staff Raising Support',
    'Assignment > Grade': asg.GRADE || 'Not Graded',
    'Assignment > Department': asg.DEPARTMENT || 'Campus Faculty Commons',
    'Assignment > Location': asg.LOCATION || 'CRU HQ',
    'Assignment > Assignment Category': ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || 'Full-time regular',
    'Assignment > Reg/Temp': REG_TEMP_MAP[asg.PERMANENT_TEMPORARY] || 'Regular',
    'Assignment > Full time or Part Time': FULL_PART_MAP[asg.FULL_TIME_OR_PART_TIME] || 'Full time',
    'Assignment > Hourly Salary': HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || 'Salary',
    'Assignment > Working hourrs': asg.WORKING_HOURS || '40',
    'Assignment > Working hours Frequency': FREQUENCY_MAP[asg.FREQUENCY] || 'Weekly',
    'Assignment > PeopleGroup - Support Type': PEOPLE_GROUP_MAP[asg.PEOPLE_GROUP] || 'Supported - non-RMO',
    'Assignment > PeopleGroup - Seca Status': asg.PEOPLE_GROUP || 'SECA',
    'Payroll Details > Tax reporting Unit': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    'Payroll Details > Frequency': 'Semimonthly Supported',
    'Payroll Details > Time Card required': 'N',
    'Staff and Designation > Effective Date': 'todays date',
    'Staff and Designation > Staff Account Number': person.STAFF_ACCOUNT_NUMBER || 'New',
    'Staff and Designation > Designation': person.DESIGNATION_NUMBER || 'New',
    'Staff and Designation > Primary': 'Yes',
  };

  return { testId, tab: 'Core - Add Pending Workers', scenario, fields, columnIndex: index + 2 };
}

function makeAddNonWorkerCase(
  index: number, person: PersonRow, asg: AssignmentRow
): TestCase {
  const testId = `GEN-ANW-${String(index).padStart(3, '0')}`;
  const personType = asg.PERSON_TYPE || 'Non-worker - Non-Employee';
  const scenario = personType.replace('Non-worker - ', '') + ' Applicant';

  const fields: Record<string, string> = {
    'When and Why > When': futureDate(30 + index),
    'When and Why > What': 'Add Non Worker',
    'When and Why > Legal Employer': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    'When and Why > Business Unit': asg.BUSINESS_UNIT_SHORT_CODE || 'Cru',
    'When and Why > Non Worker Type': 'Nonworker',
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': dateToExcelSerial(person.DATE_OF_BIRTH),
    'Personal Details > National ID Type': 'Social Security Number',
    'Personal Details > National ID': generateSSN(2000 + index),
    'Legistlative Details > Marital Status': MARITAL_MAP[person.MARITAL_STATUS] || 'Single',
    'Addresses > Address': 'Any valid address',
    'Assignment > Assignment Status': 'Pending - No Payroll',
    'Assignment > Person Type': personType,
    'Assignment > Job': asg.JOB || 'N/A',
    'Assignment > Department': asg.DEPARTMENT || 'Campus Faculty Commons',
    'Assignment > Location': asg.LOCATION || 'CRU HQ',
    'Assignment > Assignment Category': ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || 'Part-time regular',
    'Assignment > Reg/Temp': REG_TEMP_MAP[asg.PERMANENT_TEMPORARY] || 'Regular',
    'Assignment > Full time or Part Time': FULL_PART_MAP[asg.FULL_TIME_OR_PART_TIME] || 'Part time',
    'Assignment > Peoplegroup - Support Type': 'None',
    'Managers > Manager Type': 'Line Manager',
    'Payroll Details > Frequency': 'Expense Reimb Payroll',
    'Staff and Designation > Effective Date': "Today's date",
    'Staff and Designation > Staff Account Number': person.STAFF_ACCOUNT_NUMBER || 'New',
    'Staff and Designation > Designation': person.DESIGNATION_NUMBER || 'New',
  };

  return { testId, tab: 'Core - Add Non Worker', scenario, fields, columnIndex: index + 2 };
}

function makeRehireCase(
  index: number, person: PersonRow, asg: AssignmentRow,
  salary: SalaryRow | undefined
): TestCase {
  const testId = `GEN-RH-${String(index).padStart(3, '0')}`;
  const personType = asg.PERSON_TYPE || 'Employee - Staff';
  const scenario = personType.replace('Employee - ', '');

  const fields: Record<string, string> = {
    'Use Person > Last Name': person.LAST_NAME,
    'Use Person > First Name': person.FIRST_NAME,
    'Use Person > Worker Type': WORKER_TYPE_MAP[asg.WORKER_TYPE] || 'Employee',
    'Use Person > When': futureDate(30 + index),
    'Use Person > Legal Employer': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    "Use Person > What's the way": 'Rehire an Employee',
    'Use Person > Why': ACTION_REASON_MAP[asg.ACTION_REASON] || '12MO_FT',
    'Use Person > Business Unit': asg.BUSINESS_UNIT_SHORT_CODE || 'Cru',
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - Payroll Eligible',
    'Assignment > Person Type': personType,
    'Assignment > Job': asg.JOB || 'Accountant',
    'Assignment > Grade': asg.GRADE || 'Not Graded',
    'Assignment > Department': asg.DEPARTMENT || 'Conversion Department',
    'Assignment > Location': asg.LOCATION || 'Cru-HQ',
    'Assignment > Work from Home': 'No',
    'Assignment > Assignment Category': ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || 'Full-time regular',
    'Assignment > Reg/Temp': REG_TEMP_MAP[asg.PERMANENT_TEMPORARY] || 'Regular',
    'Assignment > Full time or Part Time': FULL_PART_MAP[asg.FULL_TIME_OR_PART_TIME] || 'Full Time',
    'Assignment > Hourly Salary': HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || 'Salary',
    'Assignment > Working Hours': asg.WORKING_HOURS || '40',
    'Assignment > Working Hours Frequesncy': FREQUENCY_MAP[asg.FREQUENCY] || 'weekly',
    'Assignment > Peoplegroup - Support Type': PEOPLE_GROUP_MAP[asg.PEOPLE_GROUP] || 'None',
    'Assignment > Peoplegroup - Seca Status': asg.PEOPLE_GROUP || 'FICA',
    'Payroll Details > Tax reporting Unit': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    'Payroll Details > Time Card required': asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'Y' : 'N',
  };

  // Payroll frequency
  if (asg.HOURLY_PAID_OR_SALARIED === 'H') {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Houlry';
  } else if (asg.PEOPLE_GROUP === 'SECA') {
    fields['Payroll Details > Payroll Frequency'] = 'Semimonthly Supported';
  } else {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Salaried';
  }

  if (salary) {
    fields['Salary > Salary Basis'] = SALARY_BASIS_MAP[salary.SALARYBASISNAME] || salary.SALARYBASISNAME;
    fields['Salary > Salary'] = salary.SALARYAMOUNT || '15';
  } else {
    fields['Salary > Salary Basis'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'US Hourly' : 'US Salaried';
    fields['Salary > Salary'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? '15.5' : '50000';
  }

  return { testId, tab: 'Core - rehires', scenario, fields, columnIndex: index + 2 };
}

function makePendingToHireCase(
  index: number, person: PersonRow, asg: AssignmentRow,
  salary: SalaryRow | undefined
): TestCase {
  const testId = `GEN-PTH-${String(index).padStart(3, '0')}`;
  const personType = asg.PERSON_TYPE || 'Employee - Staff';
  const scenario = personType.replace('Employee - ', '').replace('Pending - ', '');

  const fields: Record<string, string> = {
    'Search for Person Number': person.PERSON_NUMBER,
    'When': futureDate(30 + index),
    'Legal Employer': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    "What's the way": 'Hire',
    'Why': 'New Hire',
    'Business Unit': asg.BUSINESS_UNIT_SHORT_CODE || 'Cru',
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': dateToExcelSerial(person.DATE_OF_BIRTH),
    'Personal Details > National ID': generateSSN(3000 + index),
    'Personal Details > National ID Type': 'Social Security Number',
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - Payroll Eligible',
    'Assignment > Person Type': personType,
    'Assignment > Job': asg.JOB || 'New Staff Raising Support',
    'Assignment > Grade': asg.GRADE || 'Not Graded',
    'Assignment > Department': asg.DEPARTMENT || 'Campus Ministry',
    'Assignment > Location': asg.LOCATION || 'CRU HQ',
    'Assignment > Assignment Category': ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || 'Full-time regular',
    'Assignment > Reg/Temp': REG_TEMP_MAP[asg.PERMANENT_TEMPORARY] || 'Regular',
    'Assignment > Full time or Part Time': FULL_PART_MAP[asg.FULL_TIME_OR_PART_TIME] || 'Full Time',
    'Assignment > Hourly Salary': HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || 'Salary',
    'Assignment > Working hours': asg.WORKING_HOURS || '40',
    'Assignment > Frequency': FREQUENCY_MAP[asg.FREQUENCY] || 'Weekly',
    'Assignment > Peoplegroup - Support Type': PEOPLE_GROUP_MAP[asg.PEOPLE_GROUP] || 'Supported - non-RMO',
    'Assignment > Peoplegroup - Seca Status': asg.PEOPLE_GROUP || 'SECA',
    'Managers > Manager': 'Kelly Murray',
    'Managers > Manager Type': 'Line Manager',
    'Payroll Details > Tax reporting Unit': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    'Payroll Details > Time Card required': asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'Y' : 'N',
  };

  if (salary) {
    fields['Salary > Salary Basis'] = SALARY_BASIS_MAP[salary.SALARYBASISNAME] || salary.SALARYBASISNAME;
    fields['Salary > Salary'] = salary.SALARYAMOUNT || '50000';
  } else {
    fields['Salary > Salary Basis'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'US Hourly' : 'US Salaried';
    fields['Salary > Salary'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? '15' : '50000';
  }

  // Payroll frequency
  if (asg.HOURLY_PAID_OR_SALARIED === 'H') {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Hourly';
  } else if (asg.PEOPLE_GROUP === 'SECA') {
    fields['Payroll Details > Payroll Frequency'] = 'Semimonthly Supported';
  } else {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Salaried';
  }

  // Staff and Designation
  fields['Staff and Designation > Effective Date'] = 'todays date';
  fields['Staff and Designation > Staff Account Number'] = person.STAFF_ACCOUNT_NUMBER || 'New';
  fields['Staff and Designation > Designation'] = person.DESIGNATION_NUMBER || 'New';

  return { testId, tab: 'Core - One app Pending to Hire', scenario, fields, columnIndex: index + 2 };
}

function makeCreateWorkRelCase(
  index: number, person: PersonRow, asg: AssignmentRow
): TestCase {
  const testId = `GEN-CWR-${String(index).padStart(3, '0')}`;
  const scenario = (asg.PERSON_TYPE || 'Non-worker - Staff').replace('Non-worker - ', '');

  const fields: Record<string, string> = {
    'Search for Person': `${person.FIRST_NAME} ${person.LAST_NAME} - ${person.PERSON_NUMBER}`,
    'Worker Type': WORKER_TYPE_MAP[asg.WORKER_TYPE] || 'Non Worker',
    'Legal Employer': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
    "What's the way": 'Create Work Relationship',
    'Business Unit': asg.BUSINESS_UNIT_SHORT_CODE || 'Cru',
    'Assignment > Person Type': asg.PERSON_TYPE || 'Non-worker - Staff',
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - No Payroll',
    'Assignment > Job': asg.JOB || 'N/A',
    'Assignment > Department': asg.DEPARTMENT || 'Campus Faculty Commons',
    'Assignment > Location': asg.LOCATION || 'CRU HQ',
    'Managers > Manager Type': 'Line Manager',
    'Payroll Details > Tax reporting Unit': asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.',
  };

  return { testId, tab: 'Core - Create Work Relationship', scenario, fields, columnIndex: index + 2 };
}

function makeAssignmentChangeCase(
  index: number, person: PersonRow, asg: AssignmentRow
): TestCase {
  const testId = `GEN-AC-${String(index).padStart(3, '0')}`;
  const scenario = ACTION_MAP[asg.ACTION] || 'Change Assignment';

  const fields: Record<string, string> = {
    'Starting point': scenario,
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'When - Effective date': futureDate(14 + index),
    "What's the way": ACTION_MAP[asg.ACTION] || 'Assignment Change',
    'Why': ACTION_REASON_MAP[asg.ACTION_REASON] || 'Status Change',
    'Business Unit': asg.BUSINESS_UNIT_SHORT_CODE || 'Cru',
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - Payroll Eligible',
    'Assignment > Person Type': asg.PERSON_TYPE || 'Employee - Staff',
    'Assignment > Job': asg.JOB || 'Field Staff',
    'Assignment > Grade': asg.GRADE || 'Not Graded',
    'Assignment > Department': asg.DEPARTMENT || 'Conversion Department',
    'Assignment > Location': asg.LOCATION || 'CRU_HQ',
  };

  return { testId, tab: 'Core - Assign Change/XFR', scenario, fields, columnIndex: index + 2 };
}

function makePayrollCase(
  index: number, person: PersonRow, elementName: string, effectiveDate: string
): TestCase {
  const testId = `GEN-PY-${String(index).padStart(3, '0')}`;
  const scenario = `Element Entry: ${elementName}`;

  const fields: Record<string, string> = {
    'Starting point': scenario,
    'Search For': `${person.FIRST_NAME} ${person.LAST_NAME}`,
    'Effective date': effectiveDate ? dateToExcelSerial(effectiveDate) : futureDate(30),
    'Element name': elementName,
    'General Information > Separate Tax Code': 'Regular',
    'General Information > Reason': 'Migration test',
  };

  return { testId, tab: 'Payroll', scenario, fields, columnIndex: index + 2 };
}

// ============================================================
// Main generator
// ============================================================
async function generate(tabFilter?: string): Promise<void> {
  console.log('Connecting to migration database...');
  const conn = await getConnection();
  console.log('Connected.');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allCases: Record<string, TestCase[]> = {
    'Core - Hires': [],
    'Core - Add Pending Workers': [],
    'Core - Add Non Worker': [],
    'Core - rehires': [],
    'Core - One app Pending to Hire': [],
    'Core - Create Work Relationship': [],
    'Core - Assign Change/XFR': [],
    'Core - Terms/Ends': [],
    'Payroll': [],
  };

  // --- Fetch a diverse set of persons ---
  console.log('Fetching persons...');
  const allPersons = await fetchPersons(conn, 500);
  console.log(`  Got ${allPersons.length} persons`);

  const personNums = allPersons.map(p => p.PERSON_NUMBER);
  const personMap = new Map(allPersons.map(p => [p.PERSON_NUMBER, p]));

  // --- Fetch assignments for all persons ---
  console.log('Fetching assignments...');
  // Query in batches of 100 to avoid ORA-01795
  const allAssignments: AssignmentRow[] = [];
  for (let i = 0; i < personNums.length; i += 100) {
    const batch = personNums.slice(i, i + 100);
    const rows = await fetchAssignments(conn, batch);
    allAssignments.push(...rows);
  }
  console.log(`  Got ${allAssignments.length} assignments`);

  // Group assignments by action type
  const hireAssignments = allAssignments.filter(a => a.ACTION === 'HIRE');
  const pendingAssignments = allAssignments.filter(a => a.ACTION === 'ADD_PEN_WKR');
  const changeAssignments = allAssignments.filter(a => ['ASG_CHANGE', 'TRANSFER', 'JOB_CHANGE'].includes(a.ACTION));
  const termAssignments = allAssignments.filter(a => a.ACTION === 'TERMINATION');

  // Group by person for lookup
  const asgByPerson = new Map<string, AssignmentRow[]>();
  for (const a of allAssignments) {
    if (!asgByPerson.has(a.PERSON_NUM)) asgByPerson.set(a.PERSON_NUM, []);
    asgByPerson.get(a.PERSON_NUM)!.push(a);
  }

  // --- Fetch addresses ---
  console.log('Fetching addresses...');
  const allAddresses: AddressRow[] = [];
  for (let i = 0; i < personNums.length; i += 100) {
    const batch = personNums.slice(i, i + 100);
    const rows = await fetchAddresses(conn, batch);
    allAddresses.push(...rows);
  }
  const addrByPerson = new Map<string, AddressRow>();
  for (const a of allAddresses) addrByPerson.set(a.PERSON_NUM, a);
  console.log(`  Got ${allAddresses.length} addresses`);

  // --- Fetch salaries ---
  console.log('Fetching salaries...');
  const allSalaries: SalaryRow[] = [];
  for (let i = 0; i < personNums.length; i += 100) {
    const batch = personNums.slice(i, i + 100);
    const rows = await fetchSalaries(conn, batch);
    allSalaries.push(...rows);
  }
  const salaryByPerson = new Map<string, SalaryRow>();
  for (const s of allSalaries) salaryByPerson.set(s.PERSONNUMBER, s);
  console.log(`  Got ${allSalaries.length} salaries`);

  // --- Fetch manager names ---
  console.log('Fetching manager names...');
  const managerNums = [...new Set(allAssignments.map(a => a.MANAGER_PERSON_NUMBER).filter(Boolean))];
  const managerNames = new Map<string, string>();
  for (let i = 0; i < managerNums.length; i += 100) {
    const batch = managerNums.slice(i, i + 100);
    const placeholders = batch.map((_, j) => `:p${j}`).join(',');
    const binds: Record<string, string> = {};
    batch.forEach((pn, j) => { binds[`p${j}`] = pn; });
    const result = await conn.execute<{ PERSON_NUMBER: string; FIRST_NAME: string; LAST_NAME: string }>(
      `SELECT PERSON_NUMBER, FIRST_NAME, LAST_NAME FROM PERSON WHERE PERSON_NUMBER IN (${placeholders})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    for (const row of (result.rows || [])) {
      managerNames.set(row.PERSON_NUMBER, `${row.FIRST_NAME} ${row.LAST_NAME}`);
    }
  }
  console.log(`  Got ${managerNames.size} manager names`);

  // --- Generate test cases ---

  // HIRES: Generate from hire assignments with diverse person types
  if (!tabFilter || tabFilter === 'Core - Hires') {
    console.log('\nGenerating Core - Hires...');
    const seen = new Set<string>();
    let idx = 0;
    for (const asg of hireAssignments) {
      if (idx >= 50) break;
      const personType = asg.PERSON_TYPE || '';
      // Get diverse person types
      const key = `${personType}|${asg.ASSIGNMENT_CATEGORY}|${asg.HOURLY_PAID_OR_SALARIED}`;
      if (seen.has(key) && seen.size < hireAssignments.length / 3) continue;
      seen.add(key);
      const person = personMap.get(asg.PERSON_NUM);
      if (!person) continue;
      const mgrName = managerNames.get(asg.MANAGER_PERSON_NUMBER) || 'Kelly Murray';
      allCases['Core - Hires'].push(
        makeHireCase(idx, person, asg, addrByPerson.get(asg.PERSON_NUM), salaryByPerson.get(asg.PERSON_NUM), mgrName)
      );
      idx++;
    }
    console.log(`  Generated ${allCases['Core - Hires'].length} hire cases`);
  }

  // ADD PENDING WORKERS: Generate from pending assignments
  if (!tabFilter || tabFilter === 'Core - Add Pending Workers') {
    console.log('\nGenerating Core - Add Pending Workers...');
    let idx = 0;
    for (const asg of pendingAssignments) {
      if (idx >= 20) break;
      const person = personMap.get(asg.PERSON_NUM);
      if (!person) continue;
      allCases['Core - Add Pending Workers'].push(
        makeAddPendingWorkerCase(idx, person, asg, addrByPerson.get(asg.PERSON_NUM))
      );
      idx++;
    }
    // If not enough pending assignments, create from hire assignments
    if (idx < 10) {
      for (const asg of hireAssignments) {
        if (idx >= 20) break;
        const person = personMap.get(asg.PERSON_NUM);
        if (!person) continue;
        allCases['Core - Add Pending Workers'].push(
          makeAddPendingWorkerCase(idx, person, { ...asg, ACTION: 'ADD_PEN_WKR', ASSIGNMENT_STATUS: 'PENDING_NO_PROCESS' }, addrByPerson.get(asg.PERSON_NUM))
        );
        idx++;
      }
    }
    console.log(`  Generated ${allCases['Core - Add Pending Workers'].length} pending worker cases`);
  }

  // ADD NON WORKER: Generate from non-worker person types
  if (!tabFilter || tabFilter === 'Core - Add Non Worker') {
    console.log('\nGenerating Core - Add Non Worker...');
    const nonWorkerAsgs = allAssignments.filter(a => a.WORKER_TYPE === 'N' || (a.PERSON_TYPE || '').startsWith('Non-worker'));
    let idx = 0;
    for (const asg of nonWorkerAsgs) {
      if (idx >= 15) break;
      const person = personMap.get(asg.PERSON_NUM);
      if (!person) continue;
      allCases['Core - Add Non Worker'].push(makeAddNonWorkerCase(idx, person, asg));
      idx++;
    }
    // Supplement if needed
    if (idx < 10) {
      for (const asg of hireAssignments) {
        if (idx >= 15) break;
        const person = personMap.get(asg.PERSON_NUM);
        if (!person) continue;
        allCases['Core - Add Non Worker'].push(
          makeAddNonWorkerCase(idx, person, { ...asg, WORKER_TYPE: 'N', PERSON_TYPE: 'Non-worker - Non-Employee' })
        );
        idx++;
      }
    }
    console.log(`  Generated ${allCases['Core - Add Non Worker'].length} non-worker cases`);
  }

  // REHIRES: Use terminated employees
  if (!tabFilter || tabFilter === 'Core - rehires') {
    console.log('\nGenerating Core - rehires...');
    // Find persons with termination records (rehire candidates)
    const terminatedPersonNums: string[] = [];
    for (let i = 0; i < personNums.length; i += 100) {
      const batch = personNums.slice(i, i + 100);
      const wrs = await fetchWorkRelationships(conn, batch);
      for (const wr of wrs) {
        if (wr.TERMINATION_DATE && !terminatedPersonNums.includes(wr.PERSON_NUM)) {
          terminatedPersonNums.push(wr.PERSON_NUM);
        }
      }
    }
    console.log(`  Found ${terminatedPersonNums.length} terminated persons for rehire`);

    let idx = 0;
    for (const pn of terminatedPersonNums) {
      if (idx >= 50) break;
      const person = personMap.get(pn);
      if (!person) continue;
      const asgs = asgByPerson.get(pn);
      if (!asgs || asgs.length === 0) continue;
      const asg = asgs[0]; // Use latest assignment
      allCases['Core - rehires'].push(
        makeRehireCase(idx, person, asg, salaryByPerson.get(pn))
      );
      idx++;
    }
    // Supplement with regular hires if needed
    if (idx < 30) {
      for (const asg of hireAssignments) {
        if (idx >= 50) break;
        const person = personMap.get(asg.PERSON_NUM);
        if (!person || terminatedPersonNums.includes(asg.PERSON_NUM)) continue;
        allCases['Core - rehires'].push(
          makeRehireCase(idx, person, asg, salaryByPerson.get(asg.PERSON_NUM))
        );
        idx++;
      }
    }
    console.log(`  Generated ${allCases['Core - rehires'].length} rehire cases`);
  }

  // PENDING TO HIRE: Use pending worker persons
  if (!tabFilter || tabFilter === 'Core - One app Pending to Hire') {
    console.log('\nGenerating Core - One app Pending to Hire...');
    const pendingPersonTypes = allAssignments.filter(a =>
      a.WORKER_TYPE === 'P' || (a.PERSON_TYPE || '').startsWith('Pending')
    );
    let idx = 0;
    for (const asg of pendingPersonTypes) {
      if (idx >= 25) break;
      const person = personMap.get(asg.PERSON_NUM);
      if (!person) continue;
      allCases['Core - One app Pending to Hire'].push(
        makePendingToHireCase(idx, person, asg, salaryByPerson.get(asg.PERSON_NUM))
      );
      idx++;
    }
    // Supplement if needed
    if (idx < 15) {
      for (const asg of hireAssignments) {
        if (idx >= 25) break;
        const person = personMap.get(asg.PERSON_NUM);
        if (!person) continue;
        allCases['Core - One app Pending to Hire'].push(
          makePendingToHireCase(idx, person, asg, salaryByPerson.get(asg.PERSON_NUM))
        );
        idx++;
      }
    }
    console.log(`  Generated ${allCases['Core - One app Pending to Hire'].length} pending-to-hire cases`);
  }

  // CREATE WORK RELATIONSHIP
  if (!tabFilter || tabFilter === 'Core - Create Work Relationship') {
    console.log('\nGenerating Core - Create Work Relationship...');
    const nonWorkerAsgs = allAssignments.filter(a => a.WORKER_TYPE === 'N');
    let idx = 0;
    for (const asg of nonWorkerAsgs) {
      if (idx >= 10) break;
      const person = personMap.get(asg.PERSON_NUM);
      if (!person) continue;
      allCases['Core - Create Work Relationship'].push(makeCreateWorkRelCase(idx, person, asg));
      idx++;
    }
    console.log(`  Generated ${allCases['Core - Create Work Relationship'].length} create-work-rel cases`);
  }

  // ASSIGNMENT CHANGE / TRANSFER
  if (!tabFilter || tabFilter === 'Core - Assign Change/XFR') {
    console.log('\nGenerating Core - Assign Change/XFR...');
    let idx = 0;
    for (const asg of changeAssignments) {
      if (idx >= 20) break;
      const person = personMap.get(asg.PERSON_NUM);
      if (!person) continue;
      allCases['Core - Assign Change/XFR'].push(makeAssignmentChangeCase(idx, person, asg));
      idx++;
    }
    console.log(`  Generated ${allCases['Core - Assign Change/XFR'].length} assignment change cases`);
  }

  // TERMINATIONS
  if (!tabFilter || tabFilter === 'Core - Terms/Ends') {
    console.log('\nGenerating Core - Terms/Ends...');
    let idx = 0;
    for (const asg of termAssignments) {
      if (idx >= 15) break;
      const person = personMap.get(asg.PERSON_NUM);
      if (!person) continue;

      const testId = `GEN-TRM-${String(idx).padStart(3, '0')}`;
      const fields: Record<string, string> = {
        'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
        'Person Number': person.PERSON_NUMBER,
        'When - Effective date': futureDate(7 + idx),
        "What's the way": 'Termination',
        'Why': ACTION_REASON_MAP[asg.ACTION_REASON] || 'Personal',
      };
      allCases['Core - Terms/Ends'].push({
        testId, tab: 'Core - Terms/Ends',
        scenario: ACTION_REASON_MAP[asg.ACTION_REASON] || 'Voluntary',
        fields, columnIndex: idx + 2,
      });
      idx++;
    }
    console.log(`  Generated ${allCases['Core - Terms/Ends'].length} termination cases`);
  }

  // PAYROLL ELEMENT ENTRIES
  if (!tabFilter || tabFilter === 'Payroll') {
    console.log('\nGenerating Payroll...');
    // Get distinct element entries
    const peResult = await conn.execute<{ ELEMENT_NAME: string; ASSIGNMENT_NUMBER: string; EFFECTIVE_START_DATE: string }>(
      `SELECT DISTINCT ELEMENT_NAME, ASSIGNMENT_NUMBER, EFFECTIVE_START_DATE
       FROM PAYROLL_ELEMENT_ENTRY
       WHERE ELEMENT_NAME IS NOT NULL
       AND ROWNUM <= 50`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const payrollEntries = peResult.rows || [];

    // Map assignment numbers to person numbers
    const asgNumResult = await conn.execute<{ ASSIGNMENT_NUMBER: string; PERSON_NUM: string }>(
      `SELECT DISTINCT ASSIGNMENT_NUMBER, PERSON_NUM FROM CONV_ASSIGNMENT_STRUCTURAL
       WHERE ASSIGNMENT_NUMBER IS NOT NULL
       AND ROWNUM <= 1000`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const asgNumToPersonNum = new Map<string, string>();
    for (const row of (asgNumResult.rows || [])) {
      asgNumToPersonNum.set(row.ASSIGNMENT_NUMBER, row.PERSON_NUM);
    }

    let idx = 0;
    for (const entry of payrollEntries) {
      if (idx >= 30) break;
      const personNum = asgNumToPersonNum.get(entry.ASSIGNMENT_NUMBER);
      const person = personNum ? personMap.get(personNum) : null;
      if (!person) {
        // Use a random person
        const randomPerson = allPersons[idx % allPersons.length];
        allCases['Payroll'].push(makePayrollCase(idx, randomPerson, entry.ELEMENT_NAME, entry.EFFECTIVE_START_DATE));
      } else {
        allCases['Payroll'].push(makePayrollCase(idx, person, entry.ELEMENT_NAME, entry.EFFECTIVE_START_DATE));
      }
      idx++;
    }
    console.log(`  Generated ${allCases['Payroll'].length} payroll cases`);
  }

  // --- Write output ---
  const tabToFile: Record<string, string> = {
    'Core - Hires': 'core-hires.json',
    'Core - Add Pending Workers': 'core-add-pending-workers.json',
    'Core - Add Non Worker': 'core-add-non-worker.json',
    'Core - rehires': 'core-rehires.json',
    'Core - One app Pending to Hire': 'core-one-app-pending-to-hire.json',
    'Core - Create Work Relationship': 'core-create-work-relationship.json',
    'Core - Assign Change/XFR': 'core-assign-change-xfr.json',
    'Core - Terms/Ends': 'core-terms-ends.json',
    'Payroll': 'payroll.json',
  };

  let totalCases = 0;
  for (const [tab, cases] of Object.entries(allCases)) {
    if (tabFilter && tab !== tabFilter) continue;
    const filename = tabToFile[tab];
    if (!filename) continue;
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(cases, null, 2));
    console.log(`\nWrote ${filepath}: ${cases.length} cases`);
    totalCases += cases.length;
  }

  console.log(`\n=== Total: ${totalCases} generated test cases ===`);

  await conn.close();
  console.log('Database connection closed.');
}

// ============================================================
// Entry point
// ============================================================
const tabFilter = process.argv[2];
generate(tabFilter).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
