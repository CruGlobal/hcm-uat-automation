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

// Load project .env first for Google API credentials (used for config workbook lookup)
dotenv.config();
// Then load migration DB credentials (won't override existing vars)
dotenv.config({ path: path.resolve('/home/ai/htdocs/ohcm-data-conversion/.env') });

const DB_USER = 'migration';
const DB_PASS = process.env.DB_PASSWORD || 'Hs3[cU7*Qf9]zG4-hT5!Bn*Y';
const DB_DSN = 'erps1-scan.dbnpriv.prod.oraclevcn.com/hcmsapp.dbnpriv.prod.oraclevcn.com';

const OUTPUT_DIR = path.resolve(__dirname, '..', '.cache-generated');
const UAT_PLAN_FILE = path.resolve(__dirname, '..', '.cache', 'uat-plan.json');

// ============================================================
// Value mappings: DB codes → Oracle HCM UI display values
// (Validated against the HR Configuration Workbook)
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
// PEOPLE_GROUP values from DB map to Support Type display names from Common Lookups
const PEOPLE_GROUP_MAP: Record<string, string> = {
  FICA: 'None', SECA: 'Supported RMO', OPTOUT: 'None',
  SUPPORTED_RMO: 'Supported RMO', SUPPORTED_NOT_RMO: 'Supported - non-RMO',
  DESIGNATION: 'Designation', NONE: 'None',
};
const ACTION_MAP: Record<string, string> = {
  HIRE: 'Hire', ADD_PEN_WKR: 'Add Pending Worker', TERMINATION: 'Termination',
  ASG_CHANGE: 'Assignment Change', TRANSFER: 'Transfer',
  CHANGE_SALARY: 'Change Salary', PAID_LEAVE: 'Paid Leave',
  JOB_CHANGE: 'Job Change',
};
// Action Reason codes → display names (matched to HR Configuration Workbook Action Reasons tab)
const ACTION_REASON_MAP: Record<string, string> = {
  '': 'New Hire', CMP_NEWH: 'New Hire', NEW_HIRE: 'New Hire',
  PERSONAL: 'Personal Reasons', RESIGN_PERSONAL: 'Personal Reasons',
  DISCHARGE: 'Discharge', TEAM_RELATION: 'Team Relationship',
  FICA: 'Fica  Status Change', PAY_ADJUST: 'Pay Adjustment',
  PROMOTION: 'Promotion', POS_CHG: 'Position Change',
  TEMP_TO_REG: 'Temp to Regular', GRADE_CHANGE: 'Grade Change',
  NEW_SAL_CALC: 'New Salary Calculation', MGRREQ: 'Manager Request',
  '12MO_FT': 'Rehire Within 12 mos of FT Ser', FUTURE_HIRE: 'Future Hire',
  'TRANSFER DEPARTMENT': 'Transfer department',
  'MIN TO MIN': 'DEPT: Min to Min Transfer',
  'MIN to MIN': 'DEPT: Min to Min Transfer',
  STATUS_CHANGE: 'Status Change',
  CAREER_PROG: 'Normal Career Progression',
  PAID_60DAY: 'Paid 60-Day Sabbatical', PAID_90DAY: 'Paid 90-Day Sabbatical',
  PAID_30DAY: 'Paid 30-Day Sabbatical',
  PAID_MED: 'Paid Medical (non-FMLA)', PAID_FMLA: 'Paid Family/Medical (FMLA)',
  PAID_MIL: 'Paid Military Service',
  UNPAID_MED: 'Unpaid Medical (non-FMLA)', UNPAID_FMLA: 'Unpaid Family/Medical (FMLA)',
  UNPAID_MIL: 'Unpaid Military Service',
  PLANEND: 'Planned End', ENDPROB: 'End Probation', WORKERREQ: 'Worker Request',
};
const SALARY_BASIS_MAP: Record<string, string> = {
  US_Hourly: 'US Hourly', US_Salaried: 'US Salaried',
  Supported_Staff_RMO: 'Supported Staff RMO',
};
// Location codes → display names (from HR Configuration Workbook Location tab)
const LOCATION_MAP: Record<string, string> = {
  CRU_HQ: 'Cru World Headquarters', JFILM_CA: 'Jesus Film - CA Office', AIA_HQ: 'AIA- HQ',
};
// Grade codes use "Grd" abbreviation; config workbook uses full "Grade".
// This map covers all codes from the Grade tab; built at startup from config.
// For test generation we apply gradeCodeToName() conversion.
const GRADE_CODE_REPLACEMENTS: Record<string, string> = {
  'Not Graded': 'Non Graded',  // Migration DB spelling → Oracle HCM spelling
};
// Business Unit: Only valid BU in config workbook is "Cru".
// Migration DB BUSINESS_UNIT_SHORT_CODE contains Division names, not BU names.
const VALID_BUSINESS_UNIT = 'Cru';

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

/** Convert a date string (from migration DB) to MM/DD/YYYY for Oracle HCM. */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr; // passthrough if unparseable
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

/** Generate a future date as MM/DD/YYYY, N days from today. */
function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

/** Resolve a job code from migration DB to its display name using the config workbook.
 *  Falls back to 'Raising Support Full Time' for unknown codes like CNV_JOB. */
function resolveJobName(jobCode: string): string {
  if (!jobCode) return 'Raising Support Full Time';
  // Check the runtime-populated map (loaded from config workbook)
  if (jobCodeMap.has(jobCode)) return jobCodeMap.get(jobCode)!;
  // Return the code as-is if it looks like a name already (contains spaces)
  if (jobCode.includes(' ')) return jobCode;
  return 'Raising Support Full Time';
}

/** Resolve a grade value: convert abbreviated "Grd" form to full "Grade" form,
 *  and fix "Not Graded" → "Non Graded". Falls back to "Non Graded" for
 *  grades not found in the config workbook. */
function resolveGradeName(gradeVal: string): string {
  if (!gradeVal) return 'Non Graded';
  // Check direct replacements
  if (GRADE_CODE_REPLACEMENTS[gradeVal]) return GRADE_CODE_REPLACEMENTS[gradeVal];
  // Check grade code → name map first (populated from config workbook)
  if (gradeCodeMap.has(gradeVal)) return gradeCodeMap.get(gradeVal)!;
  // Auto-convert "Grd" → "Grade" pattern and check again
  if (gradeVal.includes(' Grd ')) {
    const converted = gradeVal.replace(' Grd ', ' Grade ');
    // Verify the converted name exists in config by checking if any grade code maps to it
    const exists = Array.from(gradeCodeMap.values()).some(v => v === converted);
    if (exists) return converted;
  }
  // If we have a loaded config and this grade isn't in it, fall back to Non Graded
  if (gradeCodeMap.size > 0) {
    // Check if the value (as-is) matches any grade name in the config
    const allGradeNames = new Set(gradeCodeMap.values());
    if (!allGradeNames.has(gradeVal)) return 'Non Graded';
  }
  return gradeVal;
}

/** Resolve location code → display name. */
function resolveLocation(locCode: string): string {
  if (!locCode) return 'Cru World Headquarters';
  if (LOCATION_MAP[locCode]) return LOCATION_MAP[locCode];
  // If it already looks like a display name (contains spaces), keep it
  if (locCode.includes(' ')) return locCode;
  return 'Cru World Headquarters';
}

/** Resolve business unit — migration DB has division names, not BU names.
 *  The only valid BU in the config workbook is "Cru". */
function resolveBusinessUnit(_divisionName: string): string {
  return VALID_BUSINESS_UNIT;
}

/** Resolve department name — maps legacy migration DB names to Oracle HCM names.
 *  Uses FIXED_DEPARTMENT_ASSIGNMENTS mapping table, then validates against config workbook. */
function resolveDepartment(deptName: string, fallback: string = 'Conversion Department'): string {
  if (!deptName) return fallback;
  // Check manual overrides first (for depts not in FIXED_DEPARTMENT_ASSIGNMENTS)
  if (DEPARTMENT_MANUAL_MAP[deptName]) return DEPARTMENT_MANUAL_MAP[deptName];
  // Check migration DB mapping (old dept → new dept)
  if (departmentMap.has(deptName)) return departmentMap.get(deptName)!;
  // Already a valid config workbook department
  if (validDepartments.has(deptName)) return deptName;
  // Try case-insensitive match against valid departments
  const lower = deptName.toLowerCase();
  const match = Array.from(validDepartments).find(d => d.toLowerCase() === lower);
  if (match) return match;
  return fallback;
}

// Runtime maps populated from HR Configuration Workbook (Job Codes, Grades, Departments)
let jobCodeMap = new Map<string, string>();
let gradeCodeMap = new Map<string, string>();
let validDepartments = new Set<string>();

// Runtime map: legacy migration DB department names → Oracle HCM department names
// Populated from FIXED_DEPARTMENT_ASSIGNMENTS_2025_12_18 table at startup
let departmentMap = new Map<string, string>();

// Manual overrides for departments not in FIXED_DEPARTMENT_ASSIGNMENTS table
// or CONV_DEPT_MAPPING_TBL entries that aren't valid config workbook departments
const DEPARTMENT_MANUAL_MAP: Record<string, string> = {
  'CITYCAP Director': 'City Capacity',
  'City Innovation Lab': 'City Capacity',
  'AIA SE Asia': 'AIA Global',
  'HR Tech & Analytics': 'HR Services',
};

/** Load job code → name and grade code → name maps from the HR Config Workbook. */
async function loadConfigWorkbookMaps(): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('  Google OAuth not configured — using fallback job/grade mappings');
    return;
  }

  const CONFIG_SHEET_ID = '1eiejJ6p80kiI64KoAJO9pjuq5ZTOSF3RB-btWEjoGd8';
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  });
  const { access_token } = await tokenRes.json();
  if (!access_token) {
    console.warn('  Failed to get Google access token — using fallback mappings');
    return;
  }

  // Fetch Job Codes tab
  const jobRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG_SHEET_ID}/values/${encodeURIComponent('Job Codes')}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (jobRes.ok) {
    const jobData = await jobRes.json();
    for (const r of (jobData.values || [])) {
      if (r.length > 3 && typeof r[1] === 'string' && typeof r[2] === 'string' &&
          r[1] !== '*Name' && r[2] !== '*Job Code' && r[2]) {
        jobCodeMap.set(r[2], r[1]);  // code → name
      }
    }
    console.log(`  Loaded ${jobCodeMap.size} job code → name mappings from config workbook`);
  }

  // Fetch Grade tab
  const gradeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG_SHEET_ID}/values/${encodeURIComponent('Grade')}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (gradeRes.ok) {
    const gradeData = await gradeRes.json();
    for (const r of (gradeData.values || [])) {
      if (typeof r[0] === 'number' && typeof r[2] === 'string' && r[2]) {
        const name = r[2];
        const code = r[3] || '';
        if (code) gradeCodeMap.set(code, name);  // short code → full name
      }
    }
    console.log(`  Loaded ${gradeCodeMap.size} grade code → name mappings from config workbook`);
  }

  // Fetch Departments tab
  const deptRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG_SHEET_ID}/values/${encodeURIComponent('Departments')}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (deptRes.ok) {
    const deptData = await deptRes.json();
    for (const r of (deptData.values || [])) {
      // Data rows: col 0 = effective date (number), col 3 = Department Name
      if (r.length > 4 && typeof r[0] === 'number' && typeof r[3] === 'string' && r[3]) {
        validDepartments.add(r[3]);
      }
    }
    console.log(`  Loaded ${validDepartments.size} valid departments from config workbook`);
  }
}

/** Load department mapping from FIXED_DEPARTMENT_ASSIGNMENTS_2025_12_18.
 *  Maps old (granular) department names to new (consolidated) Oracle HCM departments.
 *  Uses the most-common new department when an old dept maps to multiple. */
async function loadDepartmentMapping(conn: oracledb.Connection): Promise<void> {
  const result = await conn.execute<{ OLD_DEPARTMENT_NAME: string; NEW_DEPARTMENT_NAME: string; CNT: number }>(
    `SELECT OLD_DEPARTMENT_NAME, NEW_DEPARTMENT_NAME, COUNT(*) as CNT
     FROM FIXED_DEPARTMENT_ASSIGNMENTS_2025_12_18
     WHERE OLD_DEPARTMENT_NAME IS NOT NULL AND NEW_DEPARTMENT_NAME IS NOT NULL
     GROUP BY OLD_DEPARTMENT_NAME, NEW_DEPARTMENT_NAME
     ORDER BY OLD_DEPARTMENT_NAME, CNT DESC`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  for (const row of (result.rows || [])) {
    // Only keep the first (most-common) mapping for each old dept
    if (!departmentMap.has(row.OLD_DEPARTMENT_NAME)) {
      departmentMap.set(row.OLD_DEPARTMENT_NAME, row.NEW_DEPARTMENT_NAME);
    }
  }
  console.log(`  Loaded ${departmentMap.size} department old→new mappings from migration DB`);
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
// New data interfaces for extended modules
// ============================================================

interface AbsenceEntryRow {
  PERSON_NUM: string;
  ABSENCE_TYPE: string;
  ABSENCE_REASON: string;
  ABSENCE_STATUS: string;
  START_DATE: string;
  END_DATE: string;
  DURATION: string;
}

interface AbsenceBalanceRow {
  PERSON_NUM: string;
  PLAN_NAME: string;
  ACCRUAL_TYPE: string;
  VALUE: string;
}

interface ParticipantRow {
  PERSON_NUM: string;
  FIRST_NAME: string;
  LAST_NAME: string;
  PROGRAMNAME: string;
  PLANNAME: string;
  OPTIONNAME: string;
  COVERAGEAMOUNT: string;
  ORIGINALENROLLMENTDATE: string;
}

interface DependentRow {
  PERSONNUMBER: string;
  PROGRAMNAME: string;
  PLANNAME: string;
  OPTIONNAME: string;
  DEPENDENTFIRSTNAME: string;
  DEPENDENTLASTNAME: string;
}

interface BeneficiaryRow {
  PERSONNUMBER: string;
  PROGRAMNAME: string;
  PLANNAME: string;
  OPTIONNAME: string;
  BENEFICIARYFIRSTNAME: string;
  BENEFICIARYLASTNAME: string;
  BENEFICIARYPERCENTAGES: string;
  BENEFCIARYTYPES: string;
}

interface TimeEntryRow {
  PERSON_NUMBER: string;
  ASSIGNMENT_NUMBER: string;
  TIME_TYPE: string;
  START_TIME: string;
  STOP_TIME: string;
  WORKDATE: string;
}

interface SalaryFullRow {
  PERSONNUMBER: string;
  ASSIGNMENTNUMBER: string;
  ACTIONCODE: string;
  ACTIONREASONCODE: string;
  DATEFROM: string;
  SALARYBASISNAME: string;
  SALARYAMOUNT: string;
}

interface MHARow {
  PERSON_NUM: string;
  EFFECTIVE_START_DT: string;
  CERTIFICATION_TYPE: string;
  CERTIFICATION_DATE: string;
  BOARD_APPROVED: string;
  AMOUNT: string;
}

interface StaffGroupRow {
  PERSON_NUMBER: string;
  EFFECTIVE_START_DATE: string;
  GROUP_ID: string;
}

interface TrainingStatusRow {
  PERSON_NUMBER: string;
  TYPE: string;
  SESSION_NUMBER: string;
  COURSE_NUMBER: string;
  STATUS: string;
}

interface TeamStructureRow {
  PERSON_NUM: string;
  TEAM_NAME: string;
  PRIMARY_TEAM: string;
  LEADER: string;
}

interface CareGiverRow {
  PERSON_NUM: string;
  CARE_GIVER_TYPE: string;
  HOURS: string;
}

interface CrisisManagementRow {
  PERSON_NUMBER: string;
  SECURE_HOME_ADDRESS: string;
  SECURE_HOME_CITY: string;
  SECURE_PHONE: string;
  SECURE_EMAIL: string;
}

interface DeptRow {
  ORACLE_DEPARTMENT: string;
  MINISTRY: string;
  SUB_MINISTRY: string;
  DEPT_DESCR: string;
}

interface EthnicMinistryRow {
  PERSON_NUMBER: string;
  PROGRAM_ID: string;
  TOTAL_AMOUNT_RECEIVED: string;
}

interface ServiceRecognitionRow {
  PERSON_NUMBER: string;
  AWARD_YEAR: string;
  AWARD_DESCRIPTION: string;
}

// ============================================================
// New data fetch functions for extended modules
// ============================================================

async function fetchInBatches<T>(
  conn: oracledb.Connection, personNums: string[],
  buildQuery: (placeholders: string) => string,
  personField?: string
): Promise<T[]> {
  if (personNums.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < personNums.length; i += 100) {
    const batch = personNums.slice(i, i + 100);
    const placeholders = batch.map((_, j) => `:p${j}`).join(',');
    const binds: Record<string, string> = {};
    batch.forEach((pn, j) => { binds[`p${j}`] = pn; });
    const result = await conn.execute<T>(
      buildQuery(placeholders), binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    results.push(...(result.rows || []) as T[]);
  }
  return results;
}

async function fetchAbsenceEntries(conn: oracledb.Connection, personNums: string[]): Promise<AbsenceEntryRow[]> {
  return fetchInBatches<AbsenceEntryRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUM, ABSENCE_TYPE, ABSENCE_REASON, ABSENCE_STATUS, START_DATE, END_DATE, DURATION
     FROM ABSENCE_ENTRIES WHERE PERSON_NUM IN (${ph})`
  );
}

async function fetchAbsenceBalances(conn: oracledb.Connection, personNums: string[]): Promise<AbsenceBalanceRow[]> {
  return fetchInBatches<AbsenceBalanceRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUM, PLAN_NAME, ACCRUAL_TYPE, VALUE
     FROM ABSENCE_BALANCES WHERE PERSON_NUM IN (${ph})`
  );
}

async function fetchParticipants(conn: oracledb.Connection, personNums: string[]): Promise<ParticipantRow[]> {
  return fetchInBatches<ParticipantRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUM, FIRST_NAME, LAST_NAME, PROGRAMNAME, PLANNAME, OPTIONNAME, COVERAGEAMOUNT, ORIGINALENROLLMENTDATE
     FROM PARTICIPANT WHERE PERSON_NUM IN (${ph})`
  );
}

async function fetchDependents(conn: oracledb.Connection, personNums: string[]): Promise<DependentRow[]> {
  return fetchInBatches<DependentRow>(conn, personNums, (ph) =>
    `SELECT PERSONNUMBER, PROGRAMNAME, PLANNAME, OPTIONNAME, DEPENDENTFIRSTNAME, DEPENDENTLASTNAME
     FROM DEPENDENT WHERE PERSONNUMBER IN (${ph})`
  );
}

async function fetchBeneficiaries(conn: oracledb.Connection, personNums: string[]): Promise<BeneficiaryRow[]> {
  return fetchInBatches<BeneficiaryRow>(conn, personNums, (ph) =>
    `SELECT PERSONNUMBER, PROGRAMNAME, PLANNAME, OPTIONNAME, BENEFICIARYFIRSTNAME, BENEFICIARYLASTNAME, BENEFICIARYPERCENTAGES, BENEFCIARYTYPES
     FROM BENEFICIARY WHERE PERSONNUMBER IN (${ph})`
  );
}

async function fetchTimeEntries(conn: oracledb.Connection, personNums: string[]): Promise<TimeEntryRow[]> {
  return fetchInBatches<TimeEntryRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUMBER, ASSIGNMENT_NUMBER, TIME_TYPE, START_TIME, STOP_TIME, WORKDATE
     FROM TIME_ENTRIES WHERE PERSON_NUMBER IN (${ph})`
  );
}

async function fetchSalaryFull(conn: oracledb.Connection, personNums: string[]): Promise<SalaryFullRow[]> {
  return fetchInBatches<SalaryFullRow>(conn, personNums, (ph) =>
    `SELECT PERSONNUMBER, ASSIGNMENTNUMBER, ACTIONCODE, ACTIONREASONCODE, DATEFROM, SALARYBASISNAME, SALARYAMOUNT
     FROM SALARY WHERE PERSONNUMBER IN (${ph})`
  );
}

async function fetchMHA(conn: oracledb.Connection, personNums: string[]): Promise<MHARow[]> {
  return fetchInBatches<MHARow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUM, EFFECTIVE_START_DT, CERTIFICATION_TYPE, CERTIFICATION_DATE, BOARD_APPROVED, AMOUNT
     FROM PERSON_MHA WHERE PERSON_NUM IN (${ph})`
  );
}

async function fetchStaffGroups(conn: oracledb.Connection, personNums: string[]): Promise<StaffGroupRow[]> {
  return fetchInBatches<StaffGroupRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUMBER, EFFECTIVE_START_DATE, GROUP_ID
     FROM PERSON_STAFF_GROUPS WHERE PERSON_NUMBER IN (${ph})`
  );
}

async function fetchTrainingStatus(conn: oracledb.Connection, personNums: string[]): Promise<TrainingStatusRow[]> {
  return fetchInBatches<TrainingStatusRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUMBER, TYPE, SESSION_NUMBER, COURSE_NUMBER, STATUS
     FROM PERSON_TRAINING_STATUS WHERE PERSON_NUMBER IN (${ph})`
  );
}

async function fetchTeamStructure(conn: oracledb.Connection, personNums: string[]): Promise<TeamStructureRow[]> {
  return fetchInBatches<TeamStructureRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUM, TEAM_NAME, PRIMARY_TEAM, LEADER
     FROM PERSON_TEAM_STRUCTURE WHERE PERSON_NUM IN (${ph})`
  );
}

async function fetchCareGivers(conn: oracledb.Connection, personNums: string[]): Promise<CareGiverRow[]> {
  return fetchInBatches<CareGiverRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUM, CARE_GIVER_TYPE, HOURS
     FROM PERSON_CARE_GIVER WHERE PERSON_NUM IN (${ph})`
  );
}

async function fetchCrisisManagement(conn: oracledb.Connection, personNums: string[]): Promise<CrisisManagementRow[]> {
  return fetchInBatches<CrisisManagementRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUMBER, SECURE_HOME_ADDRESS, SECURE_HOME_CITY, SECURE_PHONE, SECURE_EMAIL
     FROM PERSON_CRISIS_MANAGEMENT WHERE PERSON_NUMBER IN (${ph})`
  );
}

async function fetchDeptMapping(conn: oracledb.Connection): Promise<DeptRow[]> {
  const result = await conn.execute<DeptRow>(
    `SELECT ORACLE_DEPARTMENT, MINISTRY, SUB_MINISTRY, DEPT_DESCR
     FROM CONV_DEPT_MAPPING_TBL WHERE ROWNUM <= 253`,
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []) as DeptRow[];
}

async function fetchEthnicMinistry(conn: oracledb.Connection, personNums: string[]): Promise<EthnicMinistryRow[]> {
  return fetchInBatches<EthnicMinistryRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUMBER, PROGRAM_ID, TOTAL_AMOUNT_RECEIVED
     FROM PERSON_ETHNIC_MINISTRY_FUND WHERE PERSON_NUMBER IN (${ph})`
  );
}

async function fetchServiceRecognition(conn: oracledb.Connection, personNums: string[]): Promise<ServiceRecognitionRow[]> {
  return fetchInBatches<ServiceRecognitionRow>(conn, personNums, (ph) =>
    `SELECT PERSON_NUMBER, AWARD_YEAR, AWARD_DESCRIPTION
     FROM PERSON_SERVICE_RECOGNITION WHERE PERSON_NUMBER IN (${ph}) AND ROWNUM <= 500`
  );
}

// ============================================================
// UAT Plan loading and grouping
// ============================================================

type ProcessType = 'hire' | 'add_pending' | 'add_nonworker' | 'rehire' | 'pending_to_hire' |
  'create_work_rel' | 'assignment_change' | 'termination' | 'transfer' | 'payroll_element' |
  // Module-specific types
  'absence_entry' | 'absence_approval' | 'absence_admin' |
  'benefits_enrollment' | 'benefits_admin' |
  'time_entry' | 'time_approval' | 'time_admin' |
  'compensation' | 'journeys' | 'mpdx' | 'saa' | 'oneapp_other' | 'other_functions' |
  // Core HR extended types
  'salary_change' | 'bonus' | 'leave_management' | 'additional_assignment' |
  'end_additional_job' | 'document_management' | 'personal_info' | 'person_eit' |
  'workforce_structure' | 'manager_change' | 'security_role' | 'approval_delegation' |
  'mass_change' | 'vsa' | 'name_change' | 'seniority_dates' |
  'other';

function classifyBusinessProcess(tc: UATTestCase): ProcessType {
  const p = tc.businessProcess.toLowerCase();
  const cat = tc.transactionCategory.toLowerCase();
  const script = (tc.testScript || '').toLowerCase();
  const mod = (tc.module || '').toLowerCase();

  // --- Module-based routing for non-Core-HR modules ---
  if (mod === 'absence management') {
    if (p.includes('approval') || p.includes('hr specialist')) return 'absence_approval';
    if (p.includes('accrual') || p.includes('balance') || p.includes('enrollment') ||
        p.includes('evaluate') || p.includes('process') || p.includes('withdraw') ||
        p.includes('disburse') || p.includes('configuration') || p.includes('review')) return 'absence_admin';
    return 'absence_entry';
  }
  if (mod === 'benefits') {
    if (p.includes('view') || p.includes('specialist') || p.includes('confirmation') ||
        p.includes('reprocess') || p.includes('correct')) return 'benefits_admin';
    return 'benefits_enrollment';
  }
  if (mod === 'time and labor') {
    if (p.includes('approval')) return 'time_approval';
    if (p.includes('calculation') || p.includes('processing') || p.includes('configuration') ||
        p.includes('report') || p.includes('notification') || p.includes('specialist') ||
        p.includes('validation')) return 'time_admin';
    return 'time_entry';
  }
  if (mod === 'workforce compensation') return 'compensation';
  if (mod === 'journeys') return 'journeys';
  if (mod === 'mpdx') return 'mpdx';
  if (mod === 'saa') return 'saa';
  if (mod === 'other functions') return 'other_functions';

  // --- Existing Core HR / Payroll classification ---
  if (p.includes('pending') && p.includes('hire') && !p.includes('add pending'))
    return 'pending_to_hire';
  if (p.includes('add pending') || p.includes('pending worker'))
    return 'add_pending';
  if (p.includes('non worker') || p.includes('nonworker') || p.includes('add non') ||
      p.includes('as non-employee') || p.includes('as a non-employee') ||
      p.includes('continuing coverage'))
    return 'add_nonworker';
  if (p.includes('rehire'))
    return 'rehire';
  if (p.includes('create work relationship') || p.includes('staff emeritus') ||
      p.includes('retired hourly') || p.includes('self supported'))
    return 'create_work_rel';
  if (p.includes('terminat') || p.includes('end assignment') || p.includes('end work') ||
      p.includes('remove non') || p.includes('remove affiliate') || p.includes('withdraw') ||
      p.includes('term ptfs') || p.includes('term intern'))
    return 'termination';
  if (p.includes('transfer') || p.includes('company change') || p.includes('global transfer'))
    return 'transfer';
  if (p.includes('assignment change') || p.includes('change assignment') || p.includes('strategy change') ||
      p.includes('working hours') || p.includes('location change'))
    return 'assignment_change';
  if (script.includes('pay.') || cat.includes('element entr') || cat.includes('payroll') ||
      p.includes('w-2') || p.includes('short term disability') || p.includes('job change mid pay') ||
      p.includes('ess tax') || (p.includes('configuration') && mod === 'payroll'))
    return 'payroll_element';

  // --- OneApp module (check after hire/pending patterns) ---
  if (mod === 'oneapp') return 'oneapp_other';

  // --- Core HR extended classification (keyword matching) ---
  if (p.includes('hire') || p.includes('new person') || p.includes('hiring') ||
      p.includes('applies to come on') || p.includes('applied to come on'))
    return 'hire';

  // Salary / Pay changes
  if (p.includes('pay change') || p.includes('change salary') || p.includes('pay rate'))
    return 'salary_change';
  if (p.includes('bonus'))
    return 'bonus';

  // Leave management
  if (p.includes('leave') || p.includes('sabbatical') || p.includes('return from'))
    return 'leave_management';

  // Additional assignment / end additional job
  if (p.includes('additional job') && p.includes('end'))
    return 'end_additional_job';
  if (p.includes('additional job') || p.includes('add assignment') || p.includes('add assig'))
    return 'additional_assignment';

  // Document management
  if (p.includes('document') || p.includes('payroll options form'))
    return 'document_management';

  // Personal info
  if (p.includes('personal information') || p.includes('deceased') ||
      p.includes('verification') || p.includes('legacy employee'))
    return 'personal_info';
  if (p.includes('name change'))
    return 'name_change';

  // Manager change
  if (p.includes('supervisor') || p.includes('manager change'))
    return 'manager_change';

  // Seniority / service dates
  if (p.includes('seniority') || p.includes('service date') || p.includes('start date') ||
      p.includes('accrual rate') || p.includes('employment start'))
    return 'seniority_dates';

  // VSA
  if (p.includes('volunteer') || p.includes('vsa'))
    return 'vsa';

  // Security roles
  if (p.includes('security') || p.includes('aor'))
    return 'security_role';

  // Approval delegation
  if (p.includes('approval delegation'))
    return 'approval_delegation';

  // Mass changes
  if (p.includes('mass change') || p.includes('mass upload'))
    return 'mass_change';

  // Workforce structure (depts, jobs, locations, grades, EITs at org level)
  if (p.includes('workforce structure') || p.includes('dept') || p.includes('job code') ||
      p.includes('location code') || p.includes('eit value') || p.includes('salary grade') ||
      p.includes('creating job') || p.includes('error one app') || p.includes('update values on') ||
      p.includes('update roles') || p.includes('processes to update'))
    return 'workforce_structure';

  // Person EITs (staff groups, training, team, care giver, MHA, etc.)
  if (p.includes('staff group') || p.includes('training status') || p.includes('course student') ||
      p.includes('team membership') || p.includes('care giver') || p.includes('crisis') ||
      p.includes('mha') || p.includes('minister') || p.includes('service recognition') ||
      p.includes('ethnic ministry') || p.includes('acknowledgement') || p.includes('salary calculation form') ||
      p.includes('work location') || p.includes('staff account') || p.includes('designation') ||
      p.includes('securing') || p.includes('staff secure') || p.includes('merging') ||
      p.includes('splitting') || p.includes('staff member role'))
    return 'person_eit';

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
    'Why': ACTION_REASON_MAP[asg.ACTION_REASON] || 'New Hire',  // Hire default
    'Business Unit': resolveBusinessUnit(asg.BUSINESS_UNIT_SHORT_CODE),
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': formatDate(person.DATE_OF_BIRTH),
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
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Grade': resolveGradeName(asg.GRADE),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT),
    'Assignment > Location': resolveLocation(asg.LOCATION),
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
    'When and Why > Business Unit': resolveBusinessUnit(asg.BUSINESS_UNIT_SHORT_CODE),
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': formatDate(person.DATE_OF_BIRTH),
    'Personal Details > National ID Type': 'Social Security Number',
    'Personal Details > National ID': generateSSN(1000 + index),
    'Legistlative Details > Marital Status': MARITAL_MAP[person.MARITAL_STATUS] || 'Single',
    'Addresses > Address': 'Any valid address',
    'Assignment > Assignment Status': 'Pending - No Payroll',
    'Assignment > Person Type': asg.PERSON_TYPE || 'Pending Staff',
    'Assignment > Proposed Person type': (asg.PERSON_TYPE || 'Employee - Staff').replace('Pending - ', 'Employee - '),
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Grade': resolveGradeName(asg.GRADE),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT, 'Campus Faculty Commons'),
    'Assignment > Location': resolveLocation(asg.LOCATION),
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
    'Staff and Designation > Staff Account Number': asg.PEOPLE_GROUP && asg.PEOPLE_GROUP !== 'NONE' ? 'New' : (person.STAFF_ACCOUNT_NUMBER || 'New'),
    'Staff and Designation > Designation': asg.PEOPLE_GROUP && asg.PEOPLE_GROUP !== 'NONE' ? 'New' : (person.DESIGNATION_NUMBER || 'New'),
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
    'When and Why > Business Unit': resolveBusinessUnit(asg.BUSINESS_UNIT_SHORT_CODE),
    'When and Why > Non Worker Type': 'Nonworker',
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': formatDate(person.DATE_OF_BIRTH),
    'Personal Details > National ID Type': 'Social Security Number',
    'Personal Details > National ID': generateSSN(2000 + index),
    'Legistlative Details > Marital Status': MARITAL_MAP[person.MARITAL_STATUS] || 'Single',
    'Addresses > Address': 'Any valid address',
    'Assignment > Assignment Status': 'Pending - No Payroll',
    'Assignment > Person Type': personType,
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT, 'Campus Faculty Commons'),
    'Assignment > Location': resolveLocation(asg.LOCATION),
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
    'Use Person > Why': ACTION_REASON_MAP[asg.ACTION_REASON] || ACTION_REASON_MAP['12MO_FT'],
    'Use Person > Business Unit': resolveBusinessUnit(asg.BUSINESS_UNIT_SHORT_CODE),
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - Payroll Eligible',
    'Assignment > Person Type': personType,
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Grade': resolveGradeName(asg.GRADE),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT),
    'Assignment > Location': resolveLocation(asg.LOCATION),
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
    'Business Unit': resolveBusinessUnit(asg.BUSINESS_UNIT_SHORT_CODE),
    'Personal Details > Last Name - Use test case number': testId,
    'Personal Details > First Name- Use Status Description': scenario,
    'Personal Details > Birthdate': formatDate(person.DATE_OF_BIRTH),
    'Personal Details > National ID': generateSSN(3000 + index),
    'Personal Details > National ID Type': 'Social Security Number',
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - Payroll Eligible',
    'Assignment > Person Type': personType,
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Grade': resolveGradeName(asg.GRADE),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT, 'Campus Interim'),
    'Assignment > Location': resolveLocation(asg.LOCATION),
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
    'Business Unit': resolveBusinessUnit(asg.BUSINESS_UNIT_SHORT_CODE),
    'Assignment > Person Type': asg.PERSON_TYPE || 'Non-worker - Staff',
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - No Payroll',
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT, 'Campus Faculty Commons'),
    'Assignment > Location': resolveLocation(asg.LOCATION),
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
    'Why': ACTION_REASON_MAP[asg.ACTION_REASON] || ACTION_REASON_MAP['STATUS_CHANGE'],
    'Business Unit': resolveBusinessUnit(asg.BUSINESS_UNIT_SHORT_CODE),
    'Assignment > Assignment Status': ASSIGNMENT_STATUS_MAP[asg.ASSIGNMENT_STATUS] || 'Active - Payroll Eligible',
    'Assignment > Person Type': asg.PERSON_TYPE || 'Employee - Staff',
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Grade': resolveGradeName(asg.GRADE),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT),
    'Assignment > Location': resolveLocation(asg.LOCATION),
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
    'Why': ACTION_REASON_MAP[asg.ACTION_REASON] || ACTION_REASON_MAP['PERSONAL'],
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
    'Effective date': effectiveDate ? formatDate(effectiveDate) : futureDate(30),
    'Element name': elementName,
    'General Information > Separate Tax Code': 'Regular',
    'General Information > Reason': 'Migration test',
  };

  return { testId, tab: 'Payroll', scenario, fields, columnIndex: index + 2 };
}

// ============================================================
// New builder functions for extended modules
// ============================================================

function buildAbsenceFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  absEntry?: AbsenceEntryRow, absBalance?: AbsenceBalanceRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
  };

  if (absEntry) {
    fields['Absence Type'] = absEntry.ABSENCE_TYPE || '';
    fields['Reason'] = absEntry.ABSENCE_REASON || '';
    fields['Start Date'] = absEntry.START_DATE || futureDate(7 + index);
    fields['End Date'] = absEntry.END_DATE || futureDate(14 + index);
    fields['Duration'] = absEntry.DURATION || '8';
    fields['Status'] = absEntry.ABSENCE_STATUS || 'Submitted';
  } else {
    fields['Start Date'] = futureDate(7 + index);
    fields['End Date'] = futureDate(14 + index);
    fields['Duration'] = '8';
  }

  if (absBalance) {
    fields['Plan Name'] = absBalance.PLAN_NAME || '';
    fields['Accrual Type'] = absBalance.ACCRUAL_TYPE || '';
    fields['Balance'] = absBalance.VALUE || '0';
  }

  const scenario = absEntry?.ABSENCE_TYPE || 'Absence Entry';
  return { testId, tab: 'Absence Management', scenario, fields, columnIndex: index + 2 };
}

function buildAbsenceApprovalFields(
  index: number, testId: string, person: PersonRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Action': 'Approve',
  };
  return { testId, tab: 'Absence Management', scenario: 'Absence Approval', fields, columnIndex: index + 2 };
}

function buildAbsenceAdminFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  absBalance?: AbsenceBalanceRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Effective Date': futureDate(index),
  };
  if (absBalance) {
    fields['Plan Name'] = absBalance.PLAN_NAME || '';
    fields['Accrual Type'] = absBalance.ACCRUAL_TYPE || '';
    fields['Balance'] = absBalance.VALUE || '0';
  }
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
  }
  return { testId, tab: 'Absence Management', scenario: 'Absence Admin', fields, columnIndex: index + 2 };
}

function buildBenefitsFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  participant?: ParticipantRow, dependent?: DependentRow, beneficiary?: BeneficiaryRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
  };

  if (participant) {
    fields['Program'] = participant.PROGRAMNAME || '';
    fields['Plan'] = participant.PLANNAME || '';
    fields['Option'] = participant.OPTIONNAME || '';
    fields['Coverage Amount'] = participant.COVERAGEAMOUNT || '';
    fields['Enrollment Date'] = participant.ORIGINALENROLLMENTDATE || '';
  }

  if (dependent) {
    fields['Dependent Name'] = `${dependent.DEPENDENTFIRSTNAME || ''} ${dependent.DEPENDENTLASTNAME || ''}`.trim();
    fields['Dependent Plan'] = dependent.PLANNAME || '';
  }

  if (beneficiary) {
    fields['Beneficiary Name'] = `${beneficiary.BENEFICIARYFIRSTNAME || ''} ${beneficiary.BENEFICIARYLASTNAME || ''}`.trim();
    fields['Beneficiary Percentage'] = beneficiary.BENEFICIARYPERCENTAGES || '100';
    fields['Beneficiary Type'] = beneficiary.BENEFCIARYTYPES || 'Primary';
  }

  // Assignment context for reclass tests
  if (asg) {
    fields['Assignment Category'] = ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || 'Full-time regular';
    fields['Person Type'] = asg.PERSON_TYPE || 'Employee - Staff';
    fields['Job'] = resolveJobName(asg.JOB);
  }

  const scenario = participant?.PLANNAME || 'Benefits Enrollment';
  return { testId, tab: 'Benefits', scenario, fields, columnIndex: index + 2 };
}

function buildBenefitsAdminFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Effective Date': futureDate(index),
  };
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
    fields['Job'] = resolveJobName(asg.JOB);
  }
  return { testId, tab: 'Benefits', scenario: 'Benefits Admin', fields, columnIndex: index + 2 };
}

function buildTimeLaborFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  timeEntry?: TimeEntryRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
  };

  if (timeEntry) {
    fields['Time Type'] = timeEntry.TIME_TYPE || '';
    fields['Start Time'] = timeEntry.START_TIME || '';
    fields['Stop Time'] = timeEntry.STOP_TIME || '';
    fields['Work Date'] = timeEntry.WORKDATE || '';
    fields['Assignment Number'] = timeEntry.ASSIGNMENT_NUMBER || '';
  } else {
    fields['Work Date'] = futureDate(index);
  }

  if (asg) {
    fields['Assignment Category'] = ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || '';
    fields['Hourly Salary'] = HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || '';
  }

  const scenario = timeEntry?.TIME_TYPE || 'Timecard Entry';
  return { testId, tab: 'Time and Labor', scenario, fields, columnIndex: index + 2 };
}

function buildTimeAdminFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Effective Date': futureDate(index),
  };
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
    fields['Assignment Category'] = ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || '';
    fields['Hourly Salary'] = HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || '';
  }
  return { testId, tab: 'Time and Labor', scenario: 'Time Admin', fields, columnIndex: index + 2 };
}

function buildCompensationFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  salaryFull?: SalaryFullRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
  };

  if (salaryFull) {
    fields['Salary Amount'] = salaryFull.SALARYAMOUNT || '';
    fields['Salary Basis'] = SALARY_BASIS_MAP[salaryFull.SALARYBASISNAME] || salaryFull.SALARYBASISNAME || '';
    fields['Action Code'] = ACTION_MAP[salaryFull.ACTIONCODE] || salaryFull.ACTIONCODE || '';
    fields['Effective Date'] = salaryFull.DATEFROM || '';
  }

  if (asg) {
    fields['Job'] = resolveJobName(asg.JOB);
    fields['Grade'] = resolveGradeName(asg.GRADE);
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
    fields['Assignment Category'] = ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || '';
  }

  const scenario = salaryFull?.ACTIONCODE || 'Compensation';
  return { testId, tab: 'Workforce Compensation', scenario, fields, columnIndex: index + 2 };
}

function buildJourneysFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  businessProcess: string
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Journey Template': businessProcess || 'Onboarding',
    'Effective Date': futureDate(index),
  };

  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
    fields['Job'] = resolveJobName(asg.JOB);
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
  }

  return { testId, tab: 'Journeys', scenario: businessProcess || 'Journey', fields, columnIndex: index + 2 };
}

function buildMPDXFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  mha?: MHARow, salaryFull?: SalaryFullRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
  };

  if (mha) {
    fields['MHA Amount'] = mha.AMOUNT || '';
    fields['Certification Type'] = mha.CERTIFICATION_TYPE || '';
    fields['Certification Date'] = mha.CERTIFICATION_DATE || '';
    fields['Board Approved'] = mha.BOARD_APPROVED || '';
  }

  if (salaryFull) {
    fields['Salary Amount'] = salaryFull.SALARYAMOUNT || '';
    fields['Salary Basis'] = SALARY_BASIS_MAP[salaryFull.SALARYBASISNAME] || salaryFull.SALARYBASISNAME || '';
  }

  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
  }

  return { testId, tab: 'MPDX', scenario: 'MPDX', fields, columnIndex: index + 2 };
}

function buildSAAFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
  };
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
  }
  return { testId, tab: 'SAA', scenario: 'SAA', fields, columnIndex: index + 2 };
}

function buildSalaryChangeFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  salary?: SalaryRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'When - Effective date': futureDate(14 + index),
    "What's the way": 'Change Salary',
    'Why': ACTION_REASON_MAP['PAY_ADJUST'],
  };
  if (salary) {
    fields['Salary > Salary Basis'] = SALARY_BASIS_MAP[salary.SALARYBASISNAME] || salary.SALARYBASISNAME;
    fields['Salary > Salary'] = salary.SALARYAMOUNT || '50000';
  } else {
    fields['Salary > Salary Basis'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'US Hourly' : 'US Salaried';
    fields['Salary > Salary'] = asg.HOURLY_PAID_OR_SALARIED === 'H' ? '18' : '55000';
  }
  const scenario = asg.HOURLY_PAID_OR_SALARIED === 'H' ? 'Hourly Pay Change' : 'Salaried Pay Change';
  return { testId, tab: 'Core HR', scenario, fields, columnIndex: index + 2 };
}

function buildBonusFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Effective Date': futureDate(index),
    'Element Name': 'Bonus',
    'Amount': index % 2 === 0 ? '250' : '750',
  };
  if (asg) {
    fields['Assignment Category'] = ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || '';
    fields['Hourly Salary'] = HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || '';
  }
  const scenario = 'Bonus';
  return { testId, tab: 'Core HR', scenario, fields, columnIndex: index + 2 };
}

function buildLeaveFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  businessProcess: string
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'When - Effective date': futureDate(14 + index),
    "What's the way": businessProcess.includes('Return') ? 'Return from Leave' :
      businessProcess.includes('Unpaid') ? 'Unpaid Leave' : 'Paid Leave',
    'Why': businessProcess.includes('Sabbatical') ? 'Paid 60-Day Sabbatical' :
      businessProcess.includes('Medical') ? 'Paid Medical (non-FMLA)' :
      businessProcess.includes('Military') ? 'Paid Military Service' : 'Personal Reasons',
  };
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Assignment Category'] = ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || '';
  }
  return { testId, tab: 'Core HR', scenario: businessProcess || 'Leave', fields, columnIndex: index + 2 };
}

function buildAdditionalAssignmentFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'When - Effective date': futureDate(14 + index),
    "What's the way": 'Add Assignment',
    'Assignment > Job': resolveJobName(asg.JOB),
    'Assignment > Grade': resolveGradeName(asg.GRADE),
    'Assignment > Department': resolveDepartment(asg.DEPARTMENT),
    'Assignment > Location': resolveLocation(asg.LOCATION),
    'Assignment > Assignment Category': ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || 'Full-time regular',
    'Assignment > Full time or Part Time': FULL_PART_MAP[asg.FULL_TIME_OR_PART_TIME] || 'Full Time',
    'Assignment > Hourly Salary': HOURLY_SALARY_MAP[asg.HOURLY_PAID_OR_SALARIED] || 'Hourly',
    'Assignment > Working hours': asg.WORKING_HOURS || '40',
  };
  return { testId, tab: 'Core HR', scenario: 'Additional Assignment', fields, columnIndex: index + 2 };
}

function buildEndAdditionalJobFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'When - Effective date': futureDate(7 + index),
    "What's the way": 'End Assignment',
    'Why': 'Planned End',
  };
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Assignment Category'] = ASSIGNMENT_CATEGORY_MAP[asg.ASSIGNMENT_CATEGORY] || '';
  }
  return { testId, tab: 'Core HR', scenario: 'End Additional Job', fields, columnIndex: index + 2 };
}

function buildDocumentFields(
  index: number, testId: string, person: PersonRow, businessProcess: string
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Document Type': businessProcess.includes('Edit') ? 'Edit' :
      businessProcess.includes('Delete') ? 'Delete' :
      businessProcess.includes('Maintain') ? 'Maintain Types' : 'Submit',
  };
  return { testId, tab: 'Core HR', scenario: 'Document Management', fields, columnIndex: index + 2 };
}

function buildPersonalInfoFields(
  index: number, testId: string, person: PersonRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Birthdate': formatDate(person.DATE_OF_BIRTH),
    'Gender': GENDER_MAP[person.GENDER] || '',
    'Marital Status': MARITAL_MAP[person.MARITAL_STATUS] || '',
  };
  return { testId, tab: 'Core HR', scenario: 'Personal Info', fields, columnIndex: index + 2 };
}

function buildNameChangeFields(
  index: number, testId: string, person: PersonRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'New Last Name': `Test-${testId}`,
    'Effective Date': futureDate(index),
  };
  return { testId, tab: 'Core HR', scenario: 'Name Change', fields, columnIndex: index + 2 };
}

function buildManagerChangeFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  managerName: string
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'When - Effective date': futureDate(14 + index),
    "What's the way": 'Manager Change',
    'Managers > Manager': managerName || 'Kelly Murray',
    'Managers > Manager Type': 'Line Manager',
  };
  return { testId, tab: 'Core HR', scenario: 'Manager Change', fields, columnIndex: index + 2 };
}

function buildSeniorityFields(
  index: number, testId: string, person: PersonRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Effective Date': futureDate(index),
  };
  return { testId, tab: 'Core HR', scenario: 'Seniority Dates', fields, columnIndex: index + 2 };
}

function buildVSAFields(
  index: number, testId: string, person: PersonRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Effective Date': futureDate(index),
    'VSA Type': index % 2 === 0 ? 'Initial' : 'Renewal',
  };
  return { testId, tab: 'Core HR', scenario: 'VSA', fields, columnIndex: index + 2 };
}

function buildSecurityRoleFields(
  index: number, testId: string, person: PersonRow, businessProcess: string
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Role Action': businessProcess.includes('Add') ? 'Add' :
      businessProcess.includes('Remove') || businessProcess.includes('Inactivate') ? 'Remove' : 'Update',
  };
  return { testId, tab: 'Core HR', scenario: 'Security Role', fields, columnIndex: index + 2 };
}

function buildApprovalDelegationFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Effective Date': futureDate(index),
  };
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
  }
  return { testId, tab: 'Core HR', scenario: 'Approval Delegation', fields, columnIndex: index + 2 };
}

function buildMassChangeFields(
  index: number, testId: string, person: PersonRow, businessProcess: string
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'Change Type': businessProcess.includes('Job') ? 'Job Change' :
      businessProcess.includes('Dept') ? 'Department Change' :
      businessProcess.includes('Pay') ? 'Pay Change' : 'Mass Change',
  };
  return { testId, tab: 'Core HR', scenario: 'Mass Change', fields, columnIndex: index + 2 };
}

function buildWorkforceStructureFields(
  index: number, testId: string, dept?: DeptRow, businessProcess?: string
): TestCase {
  const fields: Record<string, string> = {
    'Effective Date': futureDate(index),
  };
  if (dept) {
    fields['Department'] = resolveDepartment(dept.ORACLE_DEPARTMENT, '');
    fields['Ministry'] = dept.MINISTRY || '';
    fields['Sub Ministry'] = dept.SUB_MINISTRY || '';
    fields['Description'] = dept.DEPT_DESCR || '';
  }
  if (businessProcess) {
    fields['Structure Type'] = businessProcess.includes('Job') ? 'Job' :
      businessProcess.includes('Dept') || businessProcess.includes('dept') ? 'Department' :
      businessProcess.includes('Location') || businessProcess.includes('location') ? 'Location' :
      businessProcess.includes('EIT') || businessProcess.includes('eit') ? 'EIT' :
      businessProcess.includes('Grade') || businessProcess.includes('grade') ? 'Grade' : 'Other';
  }
  return { testId, tab: 'Core HR', scenario: 'Workforce Structure', fields, columnIndex: index + 2 };
}

function buildPersonEITFields(
  index: number, testId: string, person: PersonRow,
  eitType: string, eitData?: Record<string, string>
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
    'EIT Type': eitType,
    'Effective Date': futureDate(index),
  };
  if (eitData) {
    Object.assign(fields, eitData);
  }
  return { testId, tab: 'Core HR', scenario: eitType, fields, columnIndex: index + 2 };
}

function buildMinimalPersonFields(
  index: number, testId: string, person: PersonRow, asg: AssignmentRow,
  tab: string
): TestCase {
  const fields: Record<string, string> = {
    'Person Name': `${person.LAST_NAME}, ${person.FIRST_NAME}`,
    'Person Number': person.PERSON_NUMBER,
  };
  if (asg) {
    fields['Person Type'] = asg.PERSON_TYPE || '';
    fields['Legal Employer'] = asg.LEGAL_EMPLOYER || 'Campus Crusade for Christ, Inc.';
    fields['Department'] = resolveDepartment(asg.DEPARTMENT, '');
    fields['Job'] = resolveJobName(asg.JOB);
  }
  return { testId, tab, scenario: tab, fields, columnIndex: index + 2 };
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

  console.log('\nLoading HR Configuration Workbook maps (jobs, grades, departments)...');
  await loadConfigWorkbookMaps();

  console.log('\nConnecting to migration database...');
  const conn = await getConnection();
  console.log('Connected.');

  console.log('Loading department mapping from migration DB...');
  await loadDepartmentMapping(conn);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // --- Fetch a diverse set of persons ---
  console.log('Fetching persons...');
  const allPersons = await fetchPersons(conn, 2000);
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

  // --- Fetch module-specific data for new builders ---
  console.log('Fetching absence entries...');
  const allAbsenceEntries = await fetchAbsenceEntries(conn, personNums);
  const absenceByPerson = new Map<string, AbsenceEntryRow[]>();
  for (const a of allAbsenceEntries) {
    if (!absenceByPerson.has(a.PERSON_NUM)) absenceByPerson.set(a.PERSON_NUM, []);
    absenceByPerson.get(a.PERSON_NUM)!.push(a);
  }
  console.log(`  Got ${allAbsenceEntries.length} absence entries`);

  console.log('Fetching absence balances...');
  const allAbsenceBalances = await fetchAbsenceBalances(conn, personNums);
  const absBalByPerson = new Map<string, AbsenceBalanceRow[]>();
  for (const a of allAbsenceBalances) {
    if (!absBalByPerson.has(a.PERSON_NUM)) absBalByPerson.set(a.PERSON_NUM, []);
    absBalByPerson.get(a.PERSON_NUM)!.push(a);
  }
  console.log(`  Got ${allAbsenceBalances.length} absence balances`);

  console.log('Fetching benefits participants...');
  const allParticipants = await fetchParticipants(conn, personNums);
  const participantByPerson = new Map<string, ParticipantRow[]>();
  for (const p of allParticipants) {
    if (!participantByPerson.has(p.PERSON_NUM)) participantByPerson.set(p.PERSON_NUM, []);
    participantByPerson.get(p.PERSON_NUM)!.push(p);
  }
  console.log(`  Got ${allParticipants.length} participants`);

  console.log('Fetching dependents...');
  const allDependents = await fetchDependents(conn, personNums);
  const dependentByPerson = new Map<string, DependentRow[]>();
  for (const d of allDependents) {
    if (!dependentByPerson.has(d.PERSONNUMBER)) dependentByPerson.set(d.PERSONNUMBER, []);
    dependentByPerson.get(d.PERSONNUMBER)!.push(d);
  }
  console.log(`  Got ${allDependents.length} dependents`);

  console.log('Fetching beneficiaries...');
  const allBeneficiaries = await fetchBeneficiaries(conn, personNums);
  const beneficiaryByPerson = new Map<string, BeneficiaryRow[]>();
  for (const b of allBeneficiaries) {
    if (!beneficiaryByPerson.has(b.PERSONNUMBER)) beneficiaryByPerson.set(b.PERSONNUMBER, []);
    beneficiaryByPerson.get(b.PERSONNUMBER)!.push(b);
  }
  console.log(`  Got ${allBeneficiaries.length} beneficiaries`);

  console.log('Fetching time entries...');
  const allTimeEntries = await fetchTimeEntries(conn, personNums);
  const timeByPerson = new Map<string, TimeEntryRow[]>();
  for (const t of allTimeEntries) {
    if (!timeByPerson.has(t.PERSON_NUMBER)) timeByPerson.set(t.PERSON_NUMBER, []);
    timeByPerson.get(t.PERSON_NUMBER)!.push(t);
  }
  console.log(`  Got ${allTimeEntries.length} time entries`);

  console.log('Fetching full salary history...');
  const allSalaryFull = await fetchSalaryFull(conn, personNums);
  const salaryFullByPerson = new Map<string, SalaryFullRow[]>();
  for (const s of allSalaryFull) {
    if (!salaryFullByPerson.has(s.PERSONNUMBER)) salaryFullByPerson.set(s.PERSONNUMBER, []);
    salaryFullByPerson.get(s.PERSONNUMBER)!.push(s);
  }
  console.log(`  Got ${allSalaryFull.length} salary records`);

  console.log('Fetching MHA data...');
  const allMHA = await fetchMHA(conn, personNums);
  const mhaByPerson = new Map<string, MHARow[]>();
  for (const m of allMHA) {
    if (!mhaByPerson.has(m.PERSON_NUM)) mhaByPerson.set(m.PERSON_NUM, []);
    mhaByPerson.get(m.PERSON_NUM)!.push(m);
  }
  console.log(`  Got ${allMHA.length} MHA records`);

  console.log('Fetching EIT data (staff groups, training, teams, care givers, crisis mgmt)...');
  const allStaffGroups = await fetchStaffGroups(conn, personNums);
  const staffGroupByPerson = new Map<string, StaffGroupRow[]>();
  for (const s of allStaffGroups) {
    if (!staffGroupByPerson.has(s.PERSON_NUMBER)) staffGroupByPerson.set(s.PERSON_NUMBER, []);
    staffGroupByPerson.get(s.PERSON_NUMBER)!.push(s);
  }

  const allTraining = await fetchTrainingStatus(conn, personNums);
  const trainingByPerson = new Map<string, TrainingStatusRow[]>();
  for (const t of allTraining) {
    if (!trainingByPerson.has(t.PERSON_NUMBER)) trainingByPerson.set(t.PERSON_NUMBER, []);
    trainingByPerson.get(t.PERSON_NUMBER)!.push(t);
  }

  const allTeams = await fetchTeamStructure(conn, personNums);
  const teamByPerson = new Map<string, TeamStructureRow[]>();
  for (const t of allTeams) {
    if (!teamByPerson.has(t.PERSON_NUM)) teamByPerson.set(t.PERSON_NUM, []);
    teamByPerson.get(t.PERSON_NUM)!.push(t);
  }

  const allCareGivers = await fetchCareGivers(conn, personNums);
  const careGiverByPerson = new Map<string, CareGiverRow[]>();
  for (const c of allCareGivers) {
    if (!careGiverByPerson.has(c.PERSON_NUM)) careGiverByPerson.set(c.PERSON_NUM, []);
    careGiverByPerson.get(c.PERSON_NUM)!.push(c);
  }

  const allCrisis = await fetchCrisisManagement(conn, personNums);
  const crisisByPerson = new Map<string, CrisisManagementRow>();
  for (const c of allCrisis) crisisByPerson.set(c.PERSON_NUMBER, c);

  const allEthnic = await fetchEthnicMinistry(conn, personNums);
  const ethnicByPerson = new Map<string, EthnicMinistryRow>();
  for (const e of allEthnic) ethnicByPerson.set(e.PERSON_NUMBER, e);

  const allServiceRec = await fetchServiceRecognition(conn, personNums);
  const serviceRecByPerson = new Map<string, ServiceRecognitionRow>();
  for (const s of allServiceRec) serviceRecByPerson.set(s.PERSON_NUMBER, s);

  console.log(`  Got ${allStaffGroups.length} staff groups, ${allTraining.length} training, ${allTeams.length} teams, ${allCareGivers.length} care givers, ${allCrisis.length} crisis mgmt`);

  console.log('Fetching department mapping...');
  const allDepts = await fetchDeptMapping(conn);
  console.log(`  Got ${allDepts.length} departments`);

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
    const person = (personNum ? personMap.get(personNum) : undefined) || allPersons[i % allPersons.length];
    if (!person) continue;
    fieldData[tc.testId] = buildPayrollFields(
      i, tc.testId, person, entry.ELEMENT_NAME, entry.EFFECTIVE_START_DATE
    );
    totalGenerated++;
  }

  // --- ABSENCE ENTRY tests ---
  const absenceEntryCases = grouped.get('absence_entry') || [];
  console.log(`Generating field data for ${absenceEntryCases.length} absence entry tests...`);
  const personsWithAbsence = allPersons.filter(p => absenceByPerson.has(p.PERSON_NUMBER));
  const absencePool = personsWithAbsence.length > 0 ? personsWithAbsence : allPersons;
  for (let i = 0; i < absenceEntryCases.length; i++) {
    const tc = absenceEntryCases[i];
    const person = absencePool[i % absencePool.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    const entries = absenceByPerson.get(person.PERSON_NUMBER) || [];
    const balances = absBalByPerson.get(person.PERSON_NUMBER) || [];
    fieldData[tc.testId] = buildAbsenceFields(
      i, tc.testId, person, asg, entries[i % Math.max(entries.length, 1)], balances[0]
    );
    totalGenerated++;
  }

  // --- ABSENCE APPROVAL tests ---
  const absenceApprovalCases = grouped.get('absence_approval') || [];
  console.log(`Generating field data for ${absenceApprovalCases.length} absence approval tests...`);
  for (let i = 0; i < absenceApprovalCases.length; i++) {
    const tc = absenceApprovalCases[i];
    const person = absencePool[i % absencePool.length];
    fieldData[tc.testId] = buildAbsenceApprovalFields(i, tc.testId, person);
    totalGenerated++;
  }

  // --- ABSENCE ADMIN tests ---
  const absenceAdminCases = grouped.get('absence_admin') || [];
  console.log(`Generating field data for ${absenceAdminCases.length} absence admin tests...`);
  for (let i = 0; i < absenceAdminCases.length; i++) {
    const tc = absenceAdminCases[i];
    const person = absencePool[i % absencePool.length];
    const asgAA = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    const balances = absBalByPerson.get(person.PERSON_NUMBER) || [];
    fieldData[tc.testId] = buildAbsenceAdminFields(i, tc.testId, person, asgAA, balances[0]);
    totalGenerated++;
  }

  // --- BENEFITS ENROLLMENT tests ---
  const benefitsEnrollCases = grouped.get('benefits_enrollment') || [];
  console.log(`Generating field data for ${benefitsEnrollCases.length} benefits enrollment tests...`);
  const personsWithBenefits = allPersons.filter(p => participantByPerson.has(p.PERSON_NUMBER));
  const benefitsPool = personsWithBenefits.length > 0 ? personsWithBenefits : allPersons;
  for (let i = 0; i < benefitsEnrollCases.length; i++) {
    const tc = benefitsEnrollCases[i];
    const person = benefitsPool[i % benefitsPool.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    const parts = participantByPerson.get(person.PERSON_NUMBER) || [];
    const deps = dependentByPerson.get(person.PERSON_NUMBER) || [];
    const bens = beneficiaryByPerson.get(person.PERSON_NUMBER) || [];
    fieldData[tc.testId] = buildBenefitsFields(
      i, tc.testId, person, asg,
      parts[i % Math.max(parts.length, 1)],
      deps[i % Math.max(deps.length, 1)],
      bens[i % Math.max(bens.length, 1)]
    );
    totalGenerated++;
  }

  // --- BENEFITS ADMIN tests ---
  const benefitsAdminCases = grouped.get('benefits_admin') || [];
  console.log(`Generating field data for ${benefitsAdminCases.length} benefits admin tests...`);
  for (let i = 0; i < benefitsAdminCases.length; i++) {
    const tc = benefitsAdminCases[i];
    const person = benefitsPool[i % benefitsPool.length];
    const asgBA = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildBenefitsAdminFields(i, tc.testId, person, asgBA);
    totalGenerated++;
  }

  // --- TIME ENTRY tests ---
  const timeEntryCases = grouped.get('time_entry') || [];
  console.log(`Generating field data for ${timeEntryCases.length} time entry tests...`);
  const personsWithTime = allPersons.filter(p => timeByPerson.has(p.PERSON_NUMBER));
  const timePool = personsWithTime.length > 0 ? personsWithTime : allPersons;
  for (let i = 0; i < timeEntryCases.length; i++) {
    const tc = timeEntryCases[i];
    const person = timePool[i % timePool.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    const entries = timeByPerson.get(person.PERSON_NUMBER) || [];
    fieldData[tc.testId] = buildTimeLaborFields(
      i, tc.testId, person, asg, entries[i % Math.max(entries.length, 1)]
    );
    totalGenerated++;
  }

  // --- TIME APPROVAL tests ---
  const timeApprovalCases = grouped.get('time_approval') || [];
  console.log(`Generating field data for ${timeApprovalCases.length} time approval tests...`);
  for (let i = 0; i < timeApprovalCases.length; i++) {
    const tc = timeApprovalCases[i];
    const person = timePool[i % timePool.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildTimeLaborFields(i, tc.testId, person, asg);
    totalGenerated++;
  }

  // --- TIME ADMIN tests ---
  const timeAdminCases = grouped.get('time_admin') || [];
  console.log(`Generating field data for ${timeAdminCases.length} time admin tests...`);
  for (let i = 0; i < timeAdminCases.length; i++) {
    const tc = timeAdminCases[i];
    const person = timePool[i % timePool.length];
    const asgTA = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildTimeAdminFields(i, tc.testId, person, asgTA);
    totalGenerated++;
  }

  // --- COMPENSATION tests ---
  const compCases = grouped.get('compensation') || [];
  console.log(`Generating field data for ${compCases.length} compensation tests...`);
  const personsWithSalary = allPersons.filter(p => salaryFullByPerson.has(p.PERSON_NUMBER));
  const compPool = personsWithSalary.length > 0 ? personsWithSalary : allPersons;
  for (let i = 0; i < compCases.length; i++) {
    const tc = compCases[i];
    const person = compPool[i % compPool.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    const sals = salaryFullByPerson.get(person.PERSON_NUMBER) || [];
    fieldData[tc.testId] = buildCompensationFields(
      i, tc.testId, person, asg, sals[i % Math.max(sals.length, 1)]
    );
    totalGenerated++;
  }

  // --- JOURNEYS tests ---
  const journeysCases = grouped.get('journeys') || [];
  console.log(`Generating field data for ${journeysCases.length} journeys tests...`);
  for (let i = 0; i < journeysCases.length; i++) {
    const tc = journeysCases[i];
    const person = allPersons[i % allPersons.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildJourneysFields(i, tc.testId, person, asg, tc.businessProcess);
    totalGenerated++;
  }

  // --- MPDX tests ---
  const mpdxCases = grouped.get('mpdx') || [];
  console.log(`Generating field data for ${mpdxCases.length} MPDX tests...`);
  const personsWithMHA = allPersons.filter(p => mhaByPerson.has(p.PERSON_NUMBER));
  const mpdxPool = personsWithMHA.length > 0 ? personsWithMHA : allPersons;
  for (let i = 0; i < mpdxCases.length; i++) {
    const tc = mpdxCases[i];
    const person = mpdxPool[i % mpdxPool.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    const mhas = mhaByPerson.get(person.PERSON_NUMBER) || [];
    const sals = salaryFullByPerson.get(person.PERSON_NUMBER) || [];
    fieldData[tc.testId] = buildMPDXFields(
      i, tc.testId, person, asg, mhas[0], sals[0]
    );
    totalGenerated++;
  }

  // --- SAA tests ---
  const saaCases = grouped.get('saa') || [];
  console.log(`Generating field data for ${saaCases.length} SAA tests...`);
  for (let i = 0; i < saaCases.length; i++) {
    const tc = saaCases[i];
    const person = allPersons[i % allPersons.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildSAAFields(i, tc.testId, person, asg);
    totalGenerated++;
  }

  // --- ONEAPP OTHER tests ---
  const oneappCases = grouped.get('oneapp_other') || [];
  console.log(`Generating field data for ${oneappCases.length} OneApp tests...`);
  for (let i = 0; i < oneappCases.length; i++) {
    const tc = oneappCases[i];
    const person = allPersons[i % allPersons.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildMinimalPersonFields(i, tc.testId, person, asg, 'OneApp');
    totalGenerated++;
  }

  // --- OTHER FUNCTIONS tests ---
  const otherFuncCases = grouped.get('other_functions') || [];
  console.log(`Generating field data for ${otherFuncCases.length} Other Functions tests...`);
  for (let i = 0; i < otherFuncCases.length; i++) {
    const tc = otherFuncCases[i];
    const person = allPersons[i % allPersons.length];
    const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildMinimalPersonFields(i, tc.testId, person, asg, 'Other Functions');
    totalGenerated++;
  }

  // --- SALARY CHANGE tests ---
  const salaryChangeCases = grouped.get('salary_change') || [];
  console.log(`Generating field data for ${salaryChangeCases.length} salary change tests...`);
  for (let i = 0; i < salaryChangeCases.length; i++) {
    const tc = salaryChangeCases[i];
    const pick = pickAssignment(hirePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildSalaryChangeFields(
      i, tc.testId, pick.person, pick.asg, salaryByPerson.get(pick.asg.PERSON_NUM)
    );
    totalGenerated++;
  }

  // --- BONUS tests ---
  const bonusCases = grouped.get('bonus') || [];
  console.log(`Generating field data for ${bonusCases.length} bonus tests...`);
  for (let i = 0; i < bonusCases.length; i++) {
    const tc = bonusCases[i];
    const pick = pickAssignment(hirePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildBonusFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- LEAVE MANAGEMENT tests ---
  const leaveCases = grouped.get('leave_management') || [];
  console.log(`Generating field data for ${leaveCases.length} leave management tests...`);
  for (let i = 0; i < leaveCases.length; i++) {
    const tc = leaveCases[i];
    const pick = pickAssignment(hirePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildLeaveFields(i, tc.testId, pick.person, pick.asg, tc.businessProcess);
    totalGenerated++;
  }

  // --- ADDITIONAL ASSIGNMENT tests ---
  const addAsgCases = grouped.get('additional_assignment') || [];
  console.log(`Generating field data for ${addAsgCases.length} additional assignment tests...`);
  for (let i = 0; i < addAsgCases.length; i++) {
    const tc = addAsgCases[i];
    const pick = pickAssignment(hirePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildAdditionalAssignmentFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- END ADDITIONAL JOB tests ---
  const endAsgCases = grouped.get('end_additional_job') || [];
  console.log(`Generating field data for ${endAsgCases.length} end additional job tests...`);
  for (let i = 0; i < endAsgCases.length; i++) {
    const tc = endAsgCases[i];
    const pick = pickAssignment(hirePool, i);
    if (!pick) continue;
    fieldData[tc.testId] = buildEndAdditionalJobFields(i, tc.testId, pick.person, pick.asg);
    totalGenerated++;
  }

  // --- DOCUMENT MANAGEMENT tests ---
  const docCases = grouped.get('document_management') || [];
  console.log(`Generating field data for ${docCases.length} document management tests...`);
  for (let i = 0; i < docCases.length; i++) {
    const tc = docCases[i];
    const person = allPersons[i % allPersons.length];
    fieldData[tc.testId] = buildDocumentFields(i, tc.testId, person, tc.businessProcess);
    totalGenerated++;
  }

  // --- PERSONAL INFO tests ---
  const personalInfoCases = grouped.get('personal_info') || [];
  console.log(`Generating field data for ${personalInfoCases.length} personal info tests...`);
  for (let i = 0; i < personalInfoCases.length; i++) {
    const tc = personalInfoCases[i];
    const person = allPersons[i % allPersons.length];
    fieldData[tc.testId] = buildPersonalInfoFields(i, tc.testId, person);
    totalGenerated++;
  }

  // --- NAME CHANGE tests ---
  const nameChangeCases = grouped.get('name_change') || [];
  console.log(`Generating field data for ${nameChangeCases.length} name change tests...`);
  for (let i = 0; i < nameChangeCases.length; i++) {
    const tc = nameChangeCases[i];
    const person = allPersons[i % allPersons.length];
    fieldData[tc.testId] = buildNameChangeFields(i, tc.testId, person);
    totalGenerated++;
  }

  // --- MANAGER CHANGE tests ---
  const mgrChangeCases = grouped.get('manager_change') || [];
  console.log(`Generating field data for ${mgrChangeCases.length} manager change tests...`);
  for (let i = 0; i < mgrChangeCases.length; i++) {
    const tc = mgrChangeCases[i];
    const pick = pickAssignment(hirePool, i);
    if (!pick) continue;
    const mgrName = managerNames.get(pick.asg.MANAGER_PERSON_NUMBER) || 'Kelly Murray';
    fieldData[tc.testId] = buildManagerChangeFields(i, tc.testId, pick.person, pick.asg, mgrName);
    totalGenerated++;
  }

  // --- SENIORITY DATES tests ---
  const seniorCases = grouped.get('seniority_dates') || [];
  console.log(`Generating field data for ${seniorCases.length} seniority dates tests...`);
  for (let i = 0; i < seniorCases.length; i++) {
    const tc = seniorCases[i];
    const person = allPersons[i % allPersons.length];
    fieldData[tc.testId] = buildSeniorityFields(i, tc.testId, person);
    totalGenerated++;
  }

  // --- VSA tests ---
  const vsaCases = grouped.get('vsa') || [];
  console.log(`Generating field data for ${vsaCases.length} VSA tests...`);
  for (let i = 0; i < vsaCases.length; i++) {
    const tc = vsaCases[i];
    const person = allPersons[i % allPersons.length];
    fieldData[tc.testId] = buildVSAFields(i, tc.testId, person);
    totalGenerated++;
  }

  // --- SECURITY ROLE tests ---
  const securityCases = grouped.get('security_role') || [];
  console.log(`Generating field data for ${securityCases.length} security role tests...`);
  for (let i = 0; i < securityCases.length; i++) {
    const tc = securityCases[i];
    const person = allPersons[i % allPersons.length];
    fieldData[tc.testId] = buildSecurityRoleFields(i, tc.testId, person, tc.businessProcess);
    totalGenerated++;
  }

  // --- APPROVAL DELEGATION tests ---
  const approvalDelCases = grouped.get('approval_delegation') || [];
  console.log(`Generating field data for ${approvalDelCases.length} approval delegation tests...`);
  for (let i = 0; i < approvalDelCases.length; i++) {
    const tc = approvalDelCases[i];
    const person = allPersons[i % allPersons.length];
    const asgAD = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
    fieldData[tc.testId] = buildApprovalDelegationFields(i, tc.testId, person, asgAD);
    totalGenerated++;
  }

  // --- MASS CHANGE tests ---
  const massChangeCases = grouped.get('mass_change') || [];
  console.log(`Generating field data for ${massChangeCases.length} mass change tests...`);
  for (let i = 0; i < massChangeCases.length; i++) {
    const tc = massChangeCases[i];
    const person = allPersons[i % allPersons.length];
    fieldData[tc.testId] = buildMassChangeFields(i, tc.testId, person, tc.businessProcess);
    totalGenerated++;
  }

  // --- WORKFORCE STRUCTURE tests ---
  const wfStructCases = grouped.get('workforce_structure') || [];
  console.log(`Generating field data for ${wfStructCases.length} workforce structure tests...`);
  for (let i = 0; i < wfStructCases.length; i++) {
    const tc = wfStructCases[i];
    const dept = allDepts[i % Math.max(allDepts.length, 1)];
    fieldData[tc.testId] = buildWorkforceStructureFields(i, tc.testId, dept, tc.businessProcess);
    totalGenerated++;
  }

  // --- PERSON EIT tests ---
  const personEITCases = grouped.get('person_eit') || [];
  console.log(`Generating field data for ${personEITCases.length} person EIT tests...`);
  for (let i = 0; i < personEITCases.length; i++) {
    const tc = personEITCases[i];
    const person = allPersons[i % allPersons.length];
    const bp = tc.businessProcess.toLowerCase();
    let eitType = 'EIT';
    let eitData: Record<string, string> | undefined;

    if (bp.includes('staff group')) {
      eitType = 'Staff Groups';
      const groups = staffGroupByPerson.get(person.PERSON_NUMBER) || [];
      if (groups.length > 0) eitData = { 'Group ID': groups[0].GROUP_ID || '' };
    } else if (bp.includes('training') || bp.includes('course')) {
      eitType = 'Training Status';
      const trainings = trainingByPerson.get(person.PERSON_NUMBER) || [];
      if (trainings.length > 0) eitData = {
        'Type': trainings[0].TYPE || '', 'Course Number': trainings[0].COURSE_NUMBER || '',
        'Status': trainings[0].STATUS || '',
      };
    } else if (bp.includes('team membership')) {
      eitType = 'Team Structure';
      const teams = teamByPerson.get(person.PERSON_NUMBER) || [];
      if (teams.length > 0) eitData = {
        'Team Name': teams[0].TEAM_NAME || '', 'Primary Team': teams[0].PRIMARY_TEAM || '',
        'Leader': teams[0].LEADER || '',
      };
    } else if (bp.includes('care giver')) {
      eitType = 'Care Giver';
      const cgs = careGiverByPerson.get(person.PERSON_NUMBER) || [];
      if (cgs.length > 0) eitData = {
        'Care Giver Type': cgs[0].CARE_GIVER_TYPE || '', 'Hours': cgs[0].HOURS || '',
      };
    } else if (bp.includes('crisis')) {
      eitType = 'Crisis Management';
      const crisis = crisisByPerson.get(person.PERSON_NUMBER);
      if (crisis) eitData = {
        'Secure Phone': crisis.SECURE_PHONE || '', 'Secure Email': crisis.SECURE_EMAIL || '',
      };
    } else if (bp.includes('mha') || bp.includes('minister')) {
      eitType = 'Ministers Housing Allowance';
      const mhas = mhaByPerson.get(person.PERSON_NUMBER) || [];
      if (mhas.length > 0) eitData = {
        'Amount': mhas[0].AMOUNT || '', 'Certification Date': mhas[0].CERTIFICATION_DATE || '',
      };
    } else if (bp.includes('service recognition')) {
      eitType = 'Service Recognition';
      const sr = serviceRecByPerson.get(person.PERSON_NUMBER);
      if (sr) eitData = { 'Award Year': sr.AWARD_YEAR || '' };
    } else if (bp.includes('ethnic ministry')) {
      eitType = 'Ethnic Ministry Fund';
      const em = ethnicByPerson.get(person.PERSON_NUMBER);
      if (em) eitData = { 'Program ID': em.PROGRAM_ID || '', 'Amount': em.TOTAL_AMOUNT_RECEIVED || '' };
    } else if (bp.includes('acknowledgement')) {
      eitType = 'Acknowledgements';
    } else if (bp.includes('salary calculation form')) {
      eitType = 'Salary Calculation Exceptions';
    } else if (bp.includes('work location')) {
      eitType = 'Work Locations';
    } else if (bp.includes('staff account') || bp.includes('designation')) {
      eitType = 'Staff Account and Designation';
    } else if (bp.includes('securing') || bp.includes('staff secure')) {
      eitType = 'Staff Secure Status';
    } else if (bp.includes('merging') || bp.includes('splitting')) {
      eitType = 'Account Merge/Split';
    } else if (bp.includes('staff member role')) {
      eitType = 'Staff Member Role';
    }

    fieldData[tc.testId] = buildPersonEITFields(i, tc.testId, person, eitType, eitData);
    totalGenerated++;
  }

  // --- Catch-all for any remaining 'other' tests ---
  const otherCases = grouped.get('other') || [];
  if (otherCases.length > 0) {
    console.log(`Generating field data for ${otherCases.length} remaining 'other' tests...`);
    for (let i = 0; i < otherCases.length; i++) {
      const tc = otherCases[i];
      const person = allPersons[i % allPersons.length];
      const asg = (asgByPerson.get(person.PERSON_NUMBER) || [])[0] || hirePool[0];
      fieldData[tc.testId] = buildMinimalPersonFields(i, tc.testId, person, asg, tc.module || 'Core HR');
      totalGenerated++;
    }
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
