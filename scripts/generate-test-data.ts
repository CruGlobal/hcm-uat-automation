#!/usr/bin/env npx tsx
/**
 * Generate field-level test data from the migration database,
 * keyed by UAT Plan test IDs.
 *
 * Loads the UAT Plan cache to get all testable test cases,
 * groups them by business process type, queries the migration DB
 * for matching persons/assignments, and outputs field data keyed
 * by UAT Plan testId (HR-001, PY-001, etc.).
 *
 * Usage:
 *   npx tsx scripts/generate-test-data.ts
 *
 * Output: .cache-generated/field-data.json — { [testId]: TestCase }
 */
import oracledb from 'oracledb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import type { TestCase, UATTestCase } from '../src/data/types';

// Load migration DB credentials from the data-conversion project
dotenv.config({ path: path.resolve('/home/ai/htdocs/ohcm-data-conversion/.env') });

const DB_USER = 'migration';
const DB_PASS = process.env.DB_PASSWORD || 'Hs3[cU7*Qf9]zG4-hT5!Bn*Y';
const DB_DSN = 'erps1-scan.dbnpriv.prod.oraclevcn.com/hcmsapp.dbnpriv.prod.oraclevcn.com';

const OUTPUT_DIR = path.resolve(__dirname, '..', '.cache-generated');
const UAT_PLAN_FILE = path.resolve(__dirname, '..', '.cache', 'uat-plan.json');

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
  const d = new Date(dateStr);
  const epoch = new Date(1899, 11, 30);
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
  const area = 900 + Math.floor(index / 1000) % 100;
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

async function fetchAssignments(conn: oracledb.Connection, personNums: string[]): Promise<AssignmentRow[]> {
  if (personNums.length === 0) return [];
  const placeholders = personNums.map((_, i) => `:p${i}`).join(',');
  const binds: Record<string, string> = {};
  personNums.forEach((pn, i) => { binds[`p${i}`] = pn; });

  const result = await conn.execute<AssignmentRow>(
    `SELECT PERSON_NUM, WORKER_TYPE, LEGAL_EMPLOYER, ASSIGNMENT_STATUS, ACTION, ACTION_REASON,
            PERSON_TYPE, BUSINESS_UNIT_SHORT_CODE, JOB, GRADE, DEPARTMENT, LOCATION,
            ASSIGNMENT_CATEGORY, FULL_TIME_OR_PART_TIME, PERMANENT_TEMPORARY,
            HOURLY_PAID_OR_SALARIED, WORKING_HOURS, FREQUENCY, PEOPLE_GROUP,
            MANAGER_PERSON_NUMBER, HIRE_DATE, TERMINATION_DATE
     FROM CONV_ASSIGNMENT_STRUCTURAL
     WHERE PERSON_NUM IN (${placeholders}) AND EFFECTIVE_LATEST_CHANGE = 'Y'
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
// UAT Plan loading and grouping
// ============================================================

type ProcessType = 'hire' | 'add_pending' | 'add_nonworker' | 'rehire' | 'pending_to_hire' |
  'create_work_rel' | 'assignment_change' | 'termination' | 'transfer' | 'payroll_element' | 'other';

function classifyBusinessProcess(tc: UATTestCase): ProcessType {
  const p = tc.businessProcess.toLowerCase();
  const cat = tc.transactionCategory.toLowerCase();
  const script = (tc.testScript || '').toLowerCase();

  if (p.includes('pending') && p.includes('hire') && !p.includes('add pending'))
    return 'pending_to_hire';
  if (p.includes('add pending') || p.includes('pending worker'))
    return 'add_pending';
  if (p.includes('non worker') || p.includes('nonworker') || p.includes('add non'))
    return 'add_nonworker';
  if (p.includes('rehire'))
    return 'rehire';
  if (p.includes('hire') || p.includes('new person'))
    return 'hire';
  if (p.includes('create work relationship'))
    return 'create_work_rel';
  if (p.includes('terminat') || p.includes('end assignment') || p.includes('end work'))
    return 'termination';
  if (p.includes('transfer') || p.includes('company change') || p.includes('global transfer'))
    return 'transfer';
  if (p.includes('assignment change') || p.includes('change assignment') || p.includes('strategy change'))
    return 'assignment_change';
  if (script.includes('pay.') || cat.includes('element entr') || cat.includes('payroll'))
    return 'payroll_element';

  return 'other';
}

function loadUATPlan(): UATTestCase[] {
  if (!fs.existsSync(UAT_PLAN_FILE)) {
    console.error(`UAT Plan not cached at ${UAT_PLAN_FILE}. Run: npx tsx scripts/fetch-uat-plan.ts`);
    process.exit(1);
  }
  const all: UATTestCase[] = JSON.parse(fs.readFileSync(UAT_PLAN_FILE, 'utf-8'));
  // Deduplicate by testId, skip meta tabs
  const seen = new Set<string>();
  return all.filter(tc => {
    if (tc.tabName === 'UAT_DATA' || tc.tabName === 'Instructions and Index' || tc.tabName === 'Sample Scenarios') return false;
    if (seen.has(tc.testId)) return false;
    seen.add(tc.testId);
    return true;
  });
}

// ============================================================
// Field data builders — produce TestCase objects from DB rows
// ============================================================

function buildHireFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  addr: AddressRow | undefined, salary: SalaryRow | undefined,
  managerName: string
): TestCase {
  const personType = asg.PERSON_TYPE || 'Employee - Staff';
  const scenario = personType.replace('Employee - ', '');
  const addrData = addr || SAMPLE_ADDRESSES[index % SAMPLE_ADDRESSES.length];
  const hireDate = futureDate(30 + index);

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

  if (salary) {
    fields['Salary > Salary Basis'] = SALARY_BASIS_MAP[salary.SALARYBASISNAME] || salary.SALARYBASISNAME;
    fields['Salary > Salary'] = salary.SALARYAMOUNT || '30';
  } else {
    fields['Salary > Salary Basis'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'US Hourly' : 'US Salaried';
    fields['Salary > Salary'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? '15' : '50000';
  }

  if (asg.HOURLY_PAID_OR_SALARIED === 'H') {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Hourly';
  } else if (asg.PEOPLE_GROUP === 'SECA') {
    fields['Payroll Details > Payroll Frequency'] = 'Semimonthly Supported';
  } else {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Salaried';
  }

  return { testId, tab: 'Core - Hires', scenario, fields, columnIndex: index + 2 };
}

function buildAddPendingFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  addr: AddressRow | undefined
): TestCase {
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

function buildAddNonWorkerFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
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

function buildRehireFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  salary: SalaryRow | undefined
): TestCase {
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

function buildPendingToHireFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  salary: SalaryRow | undefined
): TestCase {
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

  if (asg.HOURLY_PAID_OR_SALARIED === 'H') {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Hourly';
  } else if (asg.PEOPLE_GROUP === 'SECA') {
    fields['Payroll Details > Payroll Frequency'] = 'Semimonthly Supported';
  } else {
    fields['Payroll Details > Payroll Frequency'] = 'Biweekly Salaried';
  }

  fields['Staff and Designation > Effective Date'] = 'todays date';
  fields['Staff and Designation > Staff Account Number'] = person.STAFF_ACCOUNT_NUMBER || 'New';
  fields['Staff and Designation > Designation'] = person.DESIGNATION_NUMBER || 'New';

  return { testId, tab: 'Core - One app Pending to Hire', scenario, fields, columnIndex: index + 2 };
}

function buildCreateWorkRelFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
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

function buildAssignmentChangeFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
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

function buildTerminationFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'When - Effective date': futureDate(7 + index),
    "What's the way": 'Termination',
    'Why': ACTION_REASON_MAP[asg.ACTION_REASON] || 'Personal',
  };

  return {
    testId, tab: 'Core - Terms/Ends',
    scenario: ACTION_REASON_MAP[asg.ACTION_REASON] || 'Voluntary',
    fields, columnIndex: index + 2,
  };
}

function buildPayrollFields(
  index: number, testId: string, person: PersonRow,
  elementName: string, effectiveDate: string
): TestCase {
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
async function generate(): Promise<void> {
  // Load UAT Plan to get all test IDs and their business process types
  console.log('Loading UAT Plan...');
  const uatCases = loadUATPlan();
  console.log(`  Loaded ${uatCases.length} UAT Plan test cases`);

  // Group by process type
  const grouped = new Map<ProcessType, UATTestCase[]>();
  for (const tc of uatCases) {
    const type = classifyBusinessProcess(tc);
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(tc);
  }
  for (const [type, cases] of grouped) {
    console.log(`  ${type}: ${cases.length} tests`);
  }

  console.log('\nConnecting to migration database...');
  const conn = await getConnection();
  console.log('Connected.');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // --- Fetch a diverse set of persons ---
  console.log('Fetching persons...');
  const allPersons = await fetchPersons(conn, 500);
  console.log(`  Got ${allPersons.length} persons`);

  const personNums = allPersons.map(p => p.PERSON_NUMBER);
  const personMap = new Map(allPersons.map(p => [p.PERSON_NUMBER, p]));

  // --- Fetch assignments for all persons ---
  console.log('Fetching assignments...');
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
  const nonWorkerAssignments = allAssignments.filter(a => a.WORKER_TYPE === 'N' || (a.PERSON_TYPE || '').startsWith('Non-worker'));

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

  // --- Fetch terminated persons for rehire ---
  console.log('Fetching terminated persons...');
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
  console.log(`  Found ${terminatedPersonNums.length} terminated persons`);

  // --- Fetch payroll element entries ---
  console.log('Fetching payroll element entries...');
  const peResult = await conn.execute<{ ELEMENT_NAME: string; ASSIGNMENT_NUMBER: string; EFFECTIVE_START_DATE: string }>(
    `SELECT DISTINCT ELEMENT_NAME, ASSIGNMENT_NUMBER, EFFECTIVE_START_DATE
     FROM PAYROLL_ELEMENT_ENTRY
     WHERE ELEMENT_NAME IS NOT NULL
     AND ROWNUM <= 100`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const payrollEntries = peResult.rows || [];
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

  // ============================================================
  // Generate field data keyed by UAT Plan testId
  // ============================================================
  const fieldData: Record<string, TestCase> = {};
  let totalGenerated = 0;

  // Helper: pick a DB row from a pool, cycling through available rows
  function pickAssignment(pool: AssignmentRow[], idx: number): { person: PersonRow; asg: AssignmentRow } | null {
    if (pool.length === 0) return null;
    const asg = pool[idx % pool.length];
    const person = personMap.get(asg.PERSON_NUM);
    if (!person) return null;
    return { person, asg };
  }

  // --- HIRE tests ---
  const hireCases = grouped.get('hire') || [];
  console.log(`\nGenerating field data for ${hireCases.length} hire tests...`);
  // Combine hire + general assignments for a bigger pool
  const hirePool = hireAssignments.length > 0 ? hireAssignments : allAssignments.slice(0, 100);
  for (let i = 0; i < hireCases.length; i++) {
    const tc = hireCases[i];
    const pick = pickAssignment(hirePool, i);
    if (!pick) continue;
    const mgrName = managerNames.get(pick.asg.MANAGER_PERSON_NUMBER) || 'Kelly Murray';
    fieldData[tc.testId] = buildHireFields(
      i, tc.testId, pick.person, pick.asg,
      addrByPerson.get(pick.asg.PERSON_NUM),
      salaryByPerson.get(pick.asg.PERSON_NUM),
      mgrName
    );
    totalGenerated++;
  }

  // --- ADD PENDING WORKER tests ---
  const pendingCases = grouped.get('add_pending') || [];
  console.log(`Generating field data for ${pendingCases.length} add-pending tests...`);
  const pendingPool = pendingAssignments.length > 0 ? pendingAssignments : hirePool;
  for (let i = 0; i < pendingCases.length; i++) {
    const tc = pendingCases[i];
    const pick = pickAssignment(pendingPool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildAddPendingFields(
      i, tc.testId, pick.person, pick.asg,
      addrByPerson.get(pick.asg.PERSON_NUM)
    );
    totalGenerated++;
  }

  // --- ADD NON-WORKER tests ---
  const nonWorkerCases = grouped.get('add_nonworker') || [];
  console.log(`Generating field data for ${nonWorkerCases.length} add-nonworker tests...`);
  const nonWorkerPool = nonWorkerAssignments.length > 0 ? nonWorkerAssignments : hirePool;
  for (let i = 0; i < nonWorkerCases.length; i++) {
    const tc = nonWorkerCases[i];
    const pick = pickAssignment(nonWorkerPool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildAddNonWorkerFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- REHIRE tests ---
  const rehireCases = grouped.get('rehire') || [];
  console.log(`Generating field data for ${rehireCases.length} rehire tests...`);
  // Prefer terminated persons for rehire data
  const rehirePool: AssignmentRow[] = [];
  for (const pn of terminatedPersonNums) {
    const asgs = asgByPerson.get(pn);
    if (asgs && asgs.length > 0) rehirePool.push(asgs[0]);
  }
  const actualRehirePool = rehirePool.length > 0 ? rehirePool : hirePool;
  for (let i = 0; i < rehireCases.length; i++) {
    const tc = rehireCases[i];
    const pick = pickAssignment(actualRehirePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildRehireFields(
      i, tc.testId, pick.person, pick.asg,
      salaryByPerson.get(pick.asg.PERSON_NUM)
    );
    totalGenerated++;
  }

  // --- PENDING TO HIRE tests ---
  const pthCases = grouped.get('pending_to_hire') || [];
  console.log(`Generating field data for ${pthCases.length} pending-to-hire tests...`);
  for (let i = 0; i < pthCases.length; i++) {
    const tc = pthCases[i];
    const pick = pickAssignment(pendingPool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildPendingToHireFields(
      i, tc.testId, pick.person, pick.asg,
      salaryByPerson.get(pick.asg.PERSON_NUM)
    );
    totalGenerated++;
  }

  // --- CREATE WORK RELATIONSHIP tests ---
  const cwrCases = grouped.get('create_work_rel') || [];
  console.log(`Generating field data for ${cwrCases.length} create-work-rel tests...`);
  for (let i = 0; i < cwrCases.length; i++) {
    const tc = cwrCases[i];
    const pick = pickAssignment(nonWorkerPool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildCreateWorkRelFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- ASSIGNMENT CHANGE tests ---
  const acCases = grouped.get('assignment_change') || [];
  console.log(`Generating field data for ${acCases.length} assignment-change tests...`);
  const changePool = changeAssignments.length > 0 ? changeAssignments : hirePool;
  for (let i = 0; i < acCases.length; i++) {
    const tc = acCases[i];
    const pick = pickAssignment(changePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildAssignmentChangeFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- TRANSFER tests ---
  const transferCases = grouped.get('transfer') || [];
  console.log(`Generating field data for ${transferCases.length} transfer tests...`);
  for (let i = 0; i < transferCases.length; i++) {
    const tc = transferCases[i];
    const pick = pickAssignment(changePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildAssignmentChangeFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- TERMINATION tests ---
  const termCases = grouped.get('termination') || [];
  console.log(`Generating field data for ${termCases.length} termination tests...`);
  const termPool = termAssignments.length > 0 ? termAssignments : hirePool;
  for (let i = 0; i < termCases.length; i++) {
    const tc = termCases[i];
    const pick = pickAssignment(termPool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildTerminationFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- PAYROLL ELEMENT ENTRY tests ---
  const payCases = grouped.get('payroll_element') || [];
  console.log(`Generating field data for ${payCases.length} payroll tests...`);
  for (let i = 0; i < payCases.length; i++) {
    const tc = payCases[i];
    const entry = payrollEntries[i % payrollEntries.length];
    if (!entry) continue;
    const personNum = asgNumToPersonNum.get(entry.ASSIGNMENT_NUMBER);
    const person = personNum ? personMap.get(personNum) : allPersons[i % allPersons.length];
    if (!person) continue;
    fieldData[tc.testId] = buildPayrollFields(
      i, tc.testId, person, entry.ELEMENT_NAME, entry.EFFECTIVE_START_DATE
    );
    totalGenerated++;
  }

  // --- Write output ---
  const outputPath = path.join(OUTPUT_DIR, 'field-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(fieldData, null, 2));
  console.log(`\nWrote ${outputPath}: ${totalGenerated} field data entries`);
  console.log(`  (${Object.keys(fieldData).length} unique testIds)`);
  console.log(`  UAT Plan total: ${uatCases.length} tests`);
  console.log(`  Tests with field data: ${totalGenerated}`);
  console.log(`  Tests without field data: ${uatCases.length - totalGenerated} (non-form tests)`);

  await conn.close();
  console.log('\nDatabase connection closed.');
}

// ============================================================
// Entry point
// ============================================================
generate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
