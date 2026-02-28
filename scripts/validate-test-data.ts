#!/usr/bin/env npx tsx
/**
 * Validate generated test data (.cache-generated/field-data.json) against
 * the HR Configuration Workbook (Google Sheets).
 *
 * Checks that field values (locations, departments, jobs, grades, person types,
 * assignment statuses, salary basis, legal employers, etc.) match the valid
 * values defined in the configuration workbook.
 *
 * Also checks for date serialization issues (Excel serial numbers instead of
 * human-readable dates).
 *
 * Usage: npx tsx scripts/validate-test-data.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const CONFIG_SHEET_ID = '1eiejJ6p80kiI64KoAJO9pjuq5ZTOSF3RB-btWEjoGd8';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIELD_DATA_PATH = path.resolve(process.cwd(), '.cache-generated', 'field-data.json');

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestCase {
  testId: string;
  tab: string;
  scenario: string;
  fields: Record<string, string>;
  columnIndex: number;
}

interface ValidationIssue {
  testId: string;
  tab: string;
  field: string;
  value: string;
  issue: string;
  validValues?: string[];
}

// ─── Google Sheets helpers ───────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function fetchTab(token: string, sheetId: string, tabName: string): Promise<any[][]> {
  const range = encodeURIComponent(tabName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`Failed to fetch tab "${tabName}": ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.values || [];
}

// ─── Config Workbook Parsers ─────────────────────────────────────────────────

function parseLocations(rows: any[][]): Set<string> {
  const names = new Set<string>();
  // Data rows start after header rows; look for rows with >10 columns where col 4 (Name) is a string
  for (const r of rows) {
    if (r.length > 10 && typeof r[4] === 'string' && r[4] && typeof r[0] === 'number') {
      names.add(r[4]); // *Name (Building Name) column
    }
  }
  return names;
}

function parseBusinessUnits(rows: any[][]): Set<string> {
  const names = new Set<string>();
  // Header row has "*Name", data rows follow
  let inData = false;
  for (const r of rows) {
    if (r[0] === '*Name') { inData = true; continue; }
    if (inData && r[0] && typeof r[0] === 'string') {
      names.add(r[0]);
    }
  }
  return names;
}

function parseDepartments(rows: any[][]): Set<string> {
  const names = new Set<string>();
  // Header at row 5 has "*Effective Start Date", data starts at row 6+
  // Col 3 = Name
  for (const r of rows) {
    if (r.length > 4 && typeof r[0] === 'number' && typeof r[3] === 'string' && r[3]) {
      names.add(r[3]);
    }
  }
  return names;
}

function parseJobCodes(rows: any[][]): Set<string> {
  const names = new Set<string>();
  // Header row 5: *Effective Start Date, *Name, *Job Code, ...
  // Data rows have col 1 = Name (string)
  for (const r of rows) {
    if (r.length > 3 && typeof r[1] === 'string' && r[1] &&
        r[1] !== '*Name' && r[1] !== 'Jobs' && !r[1].includes('Navigation')) {
      names.add(r[1]);
    }
  }
  return names;
}

function parseGrades(rows: any[][]): Set<string> {
  const names = new Set<string>();
  // Data rows: col 0 = effective date (number), col 2 = Grade Name
  for (const r of rows) {
    if (typeof r[0] === 'number' && typeof r[2] === 'string' && r[2]) {
      names.add(r[2]);
    }
  }
  // Add "Non Graded" which is mentioned as needing to be added
  names.add('Non Graded');
  return names;
}

function parsePersonTypes(rows: any[][]): Map<string, Set<string>> {
  // Map: system type -> set of assignment person types
  const types = new Map<string, Set<string>>();
  const allTypes = new Set<string>();
  for (const r of rows) {
    if (r.length >= 3 && typeof r[0] === 'string' && typeof r[1] === 'string' &&
        r[0] !== '*System Person Type' && r[0] !== 'Person Types' &&
        (r[0] === 'Employee' || r[0] === 'Non Worker' || r[0].startsWith('Pending'))) {
      const sysType = r[0].trim();
      if (!types.has(sysType)) types.set(sysType, new Set());
      types.get(sysType)!.add(r[1]);
      allTypes.add(r[1]);
    }
  }
  types.set('_all', allTypes);
  return types;
}

function parseAssignmentStatuses(rows: any[][]): Set<string> {
  const statuses = new Set<string>();
  // Data rows: col 0 = Assignment Status name, col 1 = code
  for (const r of rows) {
    if (r.length >= 2 && typeof r[0] === 'string' && typeof r[1] === 'string' &&
        r[0] !== 'Assignment Status' && r[0] !== 'Assignment Statuses' &&
        r[1] !== '*Assignment Status Code') {
      statuses.add(r[0]); // Display name
      statuses.add(r[1]); // Code
    }
  }
  return statuses;
}

function parseSalaryBasis(rows: any[][]): Set<string> {
  const names = new Set<string>();
  // Data rows: col 0 = *Name
  for (const r of rows) {
    if (r.length >= 2 && typeof r[0] === 'string' && r[1] === 'Active') {
      names.add(r[0]);
    }
  }
  return names;
}

function parseLegalEntities(rows: any[][]): Set<string> {
  const names = new Set<string>();
  // Data rows: col 0 = Country, col 1 = *Name
  for (const r of rows) {
    if (r.length >= 3 && typeof r[0] === 'string' && typeof r[1] === 'string' &&
        r[0] !== '*Country' && r[1] && !r[1].includes('legal entity')) {
      names.add(r[1]);
    }
  }
  return names;
}

function parseDivisions(rows: any[][]): Set<string> {
  const names = new Set<string>();
  for (const r of rows) {
    if (r.length >= 5 && r[0] === 'New' && typeof r[2] === 'string' && r[2]) {
      names.add(r[2]);
    }
  }
  return names;
}

function parseActions(rows: any[][]): Map<string, string> {
  const actions = new Map<string, string>(); // code -> name
  for (const r of rows) {
    if (r.length >= 2 && typeof r[0] === 'string' && typeof r[1] === 'string' &&
        r[0] !== '*Action Code' && r[0] !== 'Actions' && !r[0].includes('Navigation') &&
        r[0].match(/^[A-Z_]+$/)) {
      actions.set(r[0], r[1]);
    }
  }
  return actions;
}

function parseActionReasons(rows: any[][]): Map<string, string> {
  const reasons = new Map<string, string>(); // code -> name
  for (const r of rows) {
    if (r.length >= 2 && typeof r[0] === 'string' && typeof r[1] === 'string' &&
        r[0] !== 'Action Reason Code' && r[0] !== 'Action Reasons' &&
        !r[0].includes('Navigation') && r[0].match(/^[A-Za-z0-9_ ]+$/)) {
      reasons.set(r[0], r[1]);
    }
  }
  return reasons;
}

function parseJobFamilies(rows: any[][]): Set<string> {
  const families = new Set<string>();
  for (const r of rows) {
    if (r.length >= 2 && typeof r[1] === 'string' && r[1] &&
        typeof r[0] !== 'undefined' && r[1] !== '*Name' && r[1] !== 'Job Family' &&
        !r[1].includes('Navigation')) {
      families.add(r[1]);
    }
  }
  return families;
}

function parseCommonLookups(rows: any[][]): Map<string, Map<string, string>> {
  // lookup type code -> Map(code -> meaning)
  const lookups = new Map<string, Map<string, string>>();
  let currentTypeCode = '';
  let inValues = false;

  for (const r of rows) {
    // Detect lookup type definition row
    if (r.length >= 4 && r[0] === 'Lookup Type' && r[1] === 'Meaning') {
      inValues = false;
      continue;
    }
    // Detect lookup type code row (follows "Lookup Type" header)
    if (r.length >= 4 && typeof r[0] === 'string' && r[0] && r[0] !== 'Lookup code' &&
        r[0] !== 'Lookup Type' && typeof r[1] === 'string' && typeof r[2] === 'string' &&
        r[2] && !r[0].includes('Navigation') && r[1] !== '' && !inValues) {
      currentTypeCode = r[0];
      lookups.set(currentTypeCode, new Map());
      continue;
    }
    // Detect values header
    if (r[0] === 'Lookup code') {
      inValues = true;
      continue;
    }
    // Value rows: code, display_seq, enabled(bool), start_date, end_date, meaning
    if (inValues && currentTypeCode && r.length >= 6 && typeof r[2] === 'boolean' && r[2] === true) {
      const code = String(r[0]);
      const meaning = String(r[5]);
      lookups.get(currentTypeCode)!.set(code, meaning);
    }
    // Empty row may end values section
    if (r.length === 0 || (r.length === 1 && !r[0])) {
      // Don't reset inValues - might just be a gap
    }
    // Navigation row resets
    if (r.length >= 1 && typeof r[0] === 'string' && r[0].includes('Navigation')) {
      inValues = false;
    }
  }
  return lookups;
}

// ─── Date validation ─────────────────────────────────────────────────────────

function isExcelSerialDate(value: string): boolean {
  // Excel serial dates are numbers roughly in range 40000-50000 for 2009-2036
  const num = Number(value);
  return !isNaN(num) && num >= 30000 && num <= 60000 && /^\d{5}$/.test(value.trim());
}

function excelSerialToDate(serial: number): string {
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function isDateField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return lower.includes('date') || lower.includes('when') || lower === 'start date' ||
    lower === 'end date' || lower.includes('birthdate') || lower.includes('effective') ||
    lower.includes('hire') || lower.includes('termination');
}

// ─── Main validation ─────────────────────────────────────────────────────────

async function main() {
  console.log('Loading field data...');
  const fieldData: Record<string, TestCase> = JSON.parse(
    fs.readFileSync(FIELD_DATA_PATH, 'utf-8')
  );
  const testIds = Object.keys(fieldData);
  console.log(`Loaded ${testIds.length} test cases\n`);

  console.log('Fetching HR Configuration Workbook...');
  const token = await getAccessToken();

  const tabsToFetch = [
    'Location', 'Business Units', 'Departments', 'Job Codes', 'Job Family',
    'Grade', 'Person Types', 'Assignment Status', 'Salary Basis',
    'Division', 'Common Lookups', 'Legal Entity', 'Actions', 'Action Reasons',
  ];

  const configData: Record<string, any[][]> = {};
  for (let i = 0; i < tabsToFetch.length; i += 5) {
    const batch = tabsToFetch.slice(i, i + 5);
    const results = await Promise.all(batch.map(t => fetchTab(token, CONFIG_SHEET_ID, t)));
    batch.forEach((name, idx) => {
      configData[name] = results[idx];
      console.log(`  ${name}: ${results[idx].length} rows`);
    });
  }

  // Parse valid values from config
  console.log('\nParsing valid values...');
  const validLocations = parseLocations(configData['Location']);
  const validBUs = parseBusinessUnits(configData['Business Units']);
  const validDepts = parseDepartments(configData['Departments']);
  const validJobs = parseJobCodes(configData['Job Codes']);
  const validGrades = parseGrades(configData['Grade']);
  const validPersonTypes = parsePersonTypes(configData['Person Types']);
  const validAssignmentStatuses = parseAssignmentStatuses(configData['Assignment Status']);
  const validSalaryBasis = parseSalaryBasis(configData['Salary Basis']);
  const validLegalEntities = parseLegalEntities(configData['Legal Entity']);
  const validDivisions = parseDivisions(configData['Division']);
  const validActions = parseActions(configData['Actions']);
  const validActionReasons = parseActionReasons(configData['Action Reasons']);
  const validJobFamilies = parseJobFamilies(configData['Job Family']);
  const commonLookups = parseCommonLookups(configData['Common Lookups']);

  console.log(`  Locations: ${validLocations.size} (${[...validLocations].slice(0, 3).join(', ')}...)`);
  console.log(`  Business Units: ${validBUs.size} (${[...validBUs].join(', ')})`);
  console.log(`  Departments: ${validDepts.size}`);
  console.log(`  Jobs: ${validJobs.size}`);
  console.log(`  Grades: ${validGrades.size}`);
  console.log(`  Person Types: ${validPersonTypes.get('_all')!.size}`);
  console.log(`  Assignment Statuses: ${validAssignmentStatuses.size}`);
  console.log(`  Salary Basis: ${validSalaryBasis.size} (${[...validSalaryBasis].join(', ')})`);
  console.log(`  Legal Entities: ${validLegalEntities.size} (${[...validLegalEntities].join(', ')})`);
  console.log(`  Divisions: ${validDivisions.size}`);
  console.log(`  Actions: ${validActions.size}`);
  console.log(`  Action Reasons: ${validActionReasons.size}`);
  console.log(`  Common Lookup Types: ${commonLookups.size}`);

  // ── Validate each test case ──────────────────────────────────────────────

  const issues: ValidationIssue[] = [];
  const dateIssues: ValidationIssue[] = [];
  const fieldStats = new Map<string, { total: number; invalid: number; values: Map<string, number> }>();

  function trackField(fieldKey: string, value: string, valid: boolean) {
    if (!fieldStats.has(fieldKey)) {
      fieldStats.set(fieldKey, { total: 0, invalid: 0, values: new Map() });
    }
    const stat = fieldStats.get(fieldKey)!;
    stat.total++;
    if (!valid) stat.invalid++;
    stat.values.set(value, (stat.values.get(value) || 0) + 1);
  }

  function addIssue(tc: TestCase, field: string, value: string, issue: string, validVals?: string[]) {
    issues.push({ testId: tc.testId, tab: tc.tab, field, value, issue, validValues: validVals });
  }

  for (const [testId, tc] of Object.entries(fieldData)) {
    const { fields } = tc;

    // ── Date fields: check for Excel serial numbers ──
    for (const [key, val] of Object.entries(fields)) {
      if (val && isDateField(key) && isExcelSerialDate(val)) {
        dateIssues.push({
          testId,
          tab: tc.tab,
          field: key,
          value: val,
          issue: `Excel serial date (should be ${excelSerialToDate(Number(val))})`,
        });
      }
    }

    // ── Location ──
    const location = fields['Assignment > Location'] || fields['Location'];
    if (location) {
      const valid = validLocations.has(location) ||
        [...validLocations].some(l => l.toLowerCase() === location.toLowerCase());
      trackField('Location', location, valid);
      if (!valid) {
        addIssue(tc, 'Location', location, 'Not a valid location in HR Config Workbook',
          [...validLocations]);
      }
    }

    // ── Business Unit ──
    const bu = fields['Assignment > Business Unit'] || fields['Business Unit'];
    if (bu) {
      const valid = validBUs.has(bu) ||
        [...validBUs].some(b => b.toLowerCase() === bu.toLowerCase());
      trackField('Business Unit', bu, valid);
      if (!valid) {
        addIssue(tc, 'Business Unit', bu, 'Not a valid business unit in HR Config Workbook',
          [...validBUs]);
      }
    }

    // ── Department ──
    const dept = fields['Assignment > Department'] || fields['Department'];
    if (dept) {
      const valid = validDepts.has(dept) ||
        [...validDepts].some(d => d.toLowerCase() === dept.toLowerCase());
      trackField('Department', dept, valid);
      if (!valid) {
        addIssue(tc, 'Department', dept, 'Not a valid department in HR Config Workbook');
      }
    }

    // ── Job ──
    const job = fields['Assignment > Job'] || fields['Job'];
    if (job) {
      const valid = validJobs.has(job) ||
        [...validJobs].some(j => j.toLowerCase() === job.toLowerCase());
      trackField('Job', job, valid);
      if (!valid) {
        addIssue(tc, 'Job', job, 'Not a valid job code in HR Config Workbook');
      }
    }

    // ── Grade ──
    const grade = fields['Assignment > Grade'] || fields['Grade'];
    if (grade) {
      const valid = validGrades.has(grade) ||
        [...validGrades].some(g => g.toLowerCase() === grade.toLowerCase());
      trackField('Grade', grade, valid);
      if (!valid) {
        addIssue(tc, 'Grade', grade, 'Not a valid grade in HR Config Workbook');
      }
    }

    // ── Person Type ──
    const personType = fields['Assignment > Person Type'] || fields['Person Type'];
    if (personType) {
      const allValid = validPersonTypes.get('_all')!;
      const valid = allValid.has(personType) ||
        [...allValid].some(p => p.toLowerCase() === personType.toLowerCase());
      trackField('Person Type', personType, valid);
      if (!valid) {
        addIssue(tc, 'Person Type', personType, 'Not a valid person type in HR Config Workbook',
          [...allValid]);
      }
    }

    // ── Assignment Status ──
    const asgStatus = fields['Assignment > Assignment Status'] || fields['Assignment Status'];
    if (asgStatus) {
      const valid = validAssignmentStatuses.has(asgStatus) ||
        [...validAssignmentStatuses].some(s => s.toLowerCase() === asgStatus.toLowerCase());
      trackField('Assignment Status', asgStatus, valid);
      if (!valid) {
        addIssue(tc, 'Assignment Status', asgStatus,
          'Not a valid assignment status in HR Config Workbook',
          [...validAssignmentStatuses]);
      }
    }

    // ── Assignment Category ──
    const asgCat = fields['Assignment > Assignment Category'] || fields['Assignment Category'];
    if (asgCat) {
      // Standard Oracle HCM categories + custom "On Call" from config
      const validCategories = new Set([
        'Full-time regular', 'Full-time temporary', 'Part-time regular', 'Part-time temporary',
        'On call', 'On Call', 'Seasonal',
        'FR', 'FT', 'PR', 'PT', 'ON_CALL',
      ]);
      const valid = validCategories.has(asgCat) ||
        [...validCategories].some(c => c.toLowerCase() === asgCat.toLowerCase());
      trackField('Assignment Category', asgCat, valid);
      if (!valid) {
        addIssue(tc, 'Assignment Category', asgCat,
          'Not a valid assignment category', [...validCategories]);
      }
    }

    // ── Salary Basis ──
    const salBasis = fields['Salary > Salary Basis'] || fields['Salary Basis'];
    if (salBasis) {
      const valid = validSalaryBasis.has(salBasis) ||
        [...validSalaryBasis].some(s => s.toLowerCase() === salBasis.toLowerCase());
      trackField('Salary Basis', salBasis, valid);
      if (!valid) {
        addIssue(tc, 'Salary Basis', salBasis,
          'Not a valid salary basis in HR Config Workbook', [...validSalaryBasis]);
      }
    }

    // ── Legal Employer ──
    const legalEmployer = fields['Legal Employer'];
    if (legalEmployer) {
      const valid = validLegalEntities.has(legalEmployer) ||
        [...validLegalEntities].some(e => e.toLowerCase() === legalEmployer.toLowerCase());
      trackField('Legal Employer', legalEmployer, valid);
      if (!valid) {
        addIssue(tc, 'Legal Employer', legalEmployer,
          'Not a valid legal entity in HR Config Workbook', [...validLegalEntities]);
      }
    }

    // ── Reg/Temp ──
    const regTemp = fields['Assignment > Reg/Temp'] || fields['Reg/Temp'];
    if (regTemp) {
      const valid = ['Regular', 'Temporary', 'R', 'T'].some(
        v => v.toLowerCase() === regTemp.toLowerCase()
      );
      trackField('Reg/Temp', regTemp, valid);
      if (!valid) {
        addIssue(tc, 'Reg/Temp', regTemp, 'Invalid Reg/Temp value (expected Regular or Temporary)');
      }
    }

    // ── Full/Part Time ──
    const ftpt = fields['Assignment > Full time or Part Time'] || fields['Full time or Part Time'];
    if (ftpt) {
      const valid = ['Full Time', 'Part Time', 'Full-time', 'Part-time', 'FULL_TIME', 'PART_TIME']
        .some(v => v.toLowerCase() === ftpt.toLowerCase());
      trackField('Full/Part Time', ftpt, valid);
      if (!valid) {
        addIssue(tc, 'Full/Part Time', ftpt, 'Invalid Full/Part Time value');
      }
    }

    // ── Hourly/Salary ──
    const hourlySal = fields['Assignment > Hourly Salary'] || fields['Hourly Salary'];
    if (hourlySal) {
      const valid = ['Hourly', 'Salary', 'H', 'S']
        .some(v => v.toLowerCase() === hourlySal.toLowerCase());
      trackField('Hourly/Salary', hourlySal, valid);
      if (!valid) {
        addIssue(tc, 'Hourly/Salary', hourlySal, 'Invalid Hourly/Salary value');
      }
    }

    // ── Frequency ──
    const freq = fields['Assignment > Frequency'] || fields['Frequency'];
    if (freq) {
      const valid = ['Weekly', 'Biweekly', 'Semimonthly', 'Monthly', 'Annually',
        'W', 'B', 'S', 'M', 'A']
        .some(v => v.toLowerCase() === freq.toLowerCase());
      trackField('Frequency', freq, valid);
      if (!valid) {
        addIssue(tc, 'Frequency', freq, 'Invalid Frequency value');
      }
    }

    // ── Action Reason / Why ──
    const action = fields['Why'];
    if (action) {
      const allReasonNames = [...validActionReasons.values()];
      const allReasonCodes = [...validActionReasons.keys()];
      const valid = allReasonNames.some(n => n.toLowerCase() === action.toLowerCase()) ||
        allReasonCodes.some(c => c.toLowerCase() === action.toLowerCase());
      trackField('Action Reason (Why)', action, valid);
      if (!valid) {
        addIssue(tc, 'Why (Action Reason)', action, 'Not a valid action reason in HR Config Workbook');
      }
    }

    // ── Support Type (Peoplegroup) ──
    const supportType = fields['Assignment > Peoplegroup - Support Type'];
    if (supportType) {
      const supportTypeLookup = commonLookups.get('SUPPORT TYPE');
      if (supportTypeLookup) {
        const validMeanings = [...supportTypeLookup.values()];
        const validCodes = [...supportTypeLookup.keys()];
        const valid = validMeanings.some(m => m.toLowerCase() === supportType.toLowerCase()) ||
          validCodes.some(c => c.toLowerCase() === supportType.toLowerCase());
        trackField('Support Type', supportType, valid);
        if (!valid) {
          addIssue(tc, 'Support Type', supportType,
            'Not a valid Support Type lookup', validMeanings);
        }
      }
    }

    // ── Gender (Legislative) ──
    const gender = fields['Legislative > Gender'];
    if (gender) {
      const valid = ['Male', 'Female', 'Decline to state', 'M', 'F']
        .some(v => v.toLowerCase() === gender.toLowerCase());
      trackField('Gender', gender, valid);
      if (!valid) {
        addIssue(tc, 'Gender', gender, 'Invalid gender value');
      }
    }

    // ── Marital Status ──
    const marital = fields['Legislative > Marital Status'];
    if (marital) {
      const valid = ['Single', 'Married', 'Divorced', 'Widowed', 'Legally Separated',
        'Domestic Partner', 'S', 'M', 'D', 'W']
        .some(v => v.toLowerCase() === marital.toLowerCase());
      trackField('Marital Status', marital, valid);
      if (!valid) {
        addIssue(tc, 'Marital Status', marital, 'Invalid marital status value');
      }
    }
  }

  // ─── Report ────────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION REPORT');
  console.log('='.repeat(80));

  // Date issues
  console.log(`\n${'─'.repeat(60)}`);
  console.log('DATE SERIALIZATION ISSUES');
  console.log(`${'─'.repeat(60)}`);
  if (dateIssues.length > 0) {
    // Group by field
    const byField = new Map<string, ValidationIssue[]>();
    for (const di of dateIssues) {
      if (!byField.has(di.field)) byField.set(di.field, []);
      byField.get(di.field)!.push(di);
    }
    console.log(`\nTotal: ${dateIssues.length} date fields with Excel serial numbers\n`);
    for (const [field, issues] of byField) {
      const sample = issues[0];
      console.log(`  ${field}: ${issues.length} test cases`);
      console.log(`    Example: ${sample.testId} has "${sample.value}" → ${sample.issue}`);
      // Show unique values
      const vals = new Map<string, number>();
      for (const i of issues) vals.set(i.value, (vals.get(i.value) || 0) + 1);
      const top5 = [...vals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`    Top values: ${top5.map(([v, c]) => `${v}(${c}x → ${excelSerialToDate(Number(v))})`).join(', ')}`);
    }
  } else {
    console.log('  No date serialization issues found!');
  }

  // Field value issues
  console.log(`\n${'─'.repeat(60)}`);
  console.log('FIELD VALUE VALIDATION ISSUES');
  console.log(`${'─'.repeat(60)}`);

  if (issues.length > 0) {
    // Group by field
    const byField = new Map<string, ValidationIssue[]>();
    for (const issue of issues) {
      if (!byField.has(issue.field)) byField.set(issue.field, []);
      byField.get(issue.field)!.push(issue);
    }

    console.log(`\nTotal: ${issues.length} field value mismatches across ${byField.size} field types\n`);

    for (const [field, fieldIssues] of [...byField.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n  ${field}: ${fieldIssues.length} invalid values`);

      // Show unique invalid values with counts
      const valCounts = new Map<string, number>();
      for (const i of fieldIssues) valCounts.set(i.value, (valCounts.get(i.value) || 0) + 1);
      const sorted = [...valCounts.entries()].sort((a, b) => b[1] - a[1]);

      for (const [val, count] of sorted.slice(0, 15)) {
        console.log(`    "${val}" (${count} test cases)`);
      }
      if (sorted.length > 15) {
        console.log(`    ... and ${sorted.length - 15} more unique values`);
      }

      // Show valid values if available
      if (fieldIssues[0].validValues && fieldIssues[0].validValues.length <= 20) {
        console.log(`    Valid values: ${fieldIssues[0].validValues.join(', ')}`);
      }
    }
  } else {
    console.log('  No field value issues found!');
  }

  // Summary by field
  console.log(`\n${'─'.repeat(60)}`);
  console.log('FIELD VALIDATION SUMMARY');
  console.log(`${'─'.repeat(60)}\n`);

  console.log('Field'.padEnd(25) + 'Total'.padEnd(8) + 'Valid'.padEnd(8) + 'Invalid'.padEnd(8) + '%Valid');
  console.log('-'.repeat(60));
  for (const [field, stat] of [...fieldStats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const valid = stat.total - stat.invalid;
    const pct = ((valid / stat.total) * 100).toFixed(1);
    console.log(
      field.padEnd(25) +
      String(stat.total).padEnd(8) +
      String(valid).padEnd(8) +
      String(stat.invalid).padEnd(8) +
      pct + '%'
    );
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Total test cases: ${testIds.length}`);
  console.log(`Test cases with date issues: ${new Set(dateIssues.map(d => d.testId)).size}`);
  console.log(`Test cases with value issues: ${new Set(issues.map(i => i.testId)).size}`);
  console.log(`${'─'.repeat(60)}`);

  // Save detailed report
  const reportPath = path.resolve(process.cwd(), '.cache-generated', 'validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    summary: {
      totalTestCases: testIds.length,
      dateIssueCount: dateIssues.length,
      valueIssueCount: issues.length,
      affectedByDates: new Set(dateIssues.map(d => d.testId)).size,
      affectedByValues: new Set(issues.map(i => i.testId)).size,
    },
    dateIssues,
    valueIssues: issues,
    fieldStats: Object.fromEntries(
      [...fieldStats.entries()].map(([k, v]) => [k, {
        total: v.total,
        invalid: v.invalid,
        uniqueValues: Object.fromEntries(v.values),
      }])
    ),
  }, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
}

main().catch(console.error);
