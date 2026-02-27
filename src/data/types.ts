/**
 * Test case from the UAT Plan spreadsheet.
 *
 * The sheet uses a TRANSPOSED layout:
 *   - Each TAB is a business process (e.g. "Core - Hires", "Payroll")
 *   - Column A contains field labels (section headers + field names)
 *   - Column B contains instructions/descriptions
 *   - Columns C+ each represent one test case
 *   - Row with "TestCase" in col A has the test IDs (HR-001, PY-001-01, etc.)
 *
 * We transpose this into one TestCase object per column.
 */
export interface TestCase {
  /** Test case ID from the TestCase row, e.g. "HR-001", "PY-001-01" */
  testId: string;
  /** Tab/business process this came from, e.g. "Core - Hires" */
  tab: string;
  /** Description from row 2 (scenario type), e.g. "Hourly Full Time" */
  scenario: string;
  /**
   * All field values keyed by their composite label.
   * Key format: "SectionHeader > FieldName" or just "FieldName".
   * e.g. "Personal Details > Last Name", "When", "Legal Employer"
   */
  fields: Record<string, string>;
  /** The raw column index in the sheet (for debugging). */
  columnIndex: number;
}

/** Tab names in the UAT Plan spreadsheet (actual sheet tab names). */
export const MODULE_TABS = [
  'Core - Add Pending Workers',
  'Core - Add Non Worker',
  'Core - Create Work Relationship',
  'Core - Hires',
  'Core - One app Pending to Hire',
  'Core - rehires',
  'Core - Assign Change/XFR',
  'Core - Terms/Ends',
  'Payroll',
] as const;

export type ModuleTab = (typeof MODULE_TABS)[number];

/**
 * UAT Plan test case — from the UAT Plan spreadsheet (normal row-per-test layout).
 * Contains test metadata, expected results, and references to test scripts.
 */
export interface UATTestCase {
  testId: string;
  module: string;
  businessProcess: string;
  testScenario: string;
  transactionCategory: string;
  testScript: string;
  preConditions: string;
  testData: string;
  expectedResult: string;
  status: string;
  actualResult: string;
  testerName: string;
  alithyaContact: string;
  comments: string;
  testWeek: string;
  testDate: string;
  tabName: string;
}

/** All UAT Plan modules. */
export const UAT_MODULES = [
  'Core HR',
  'Benefits',
  'Absence Management',
  'Payroll',
  'Time and Labor',
  'Journeys',
  'Workforce Compensation',
  'MPDX',
  'OneApp',
  'SAA',
  'Other Functions',
] as const;

export type UATModule = (typeof UAT_MODULES)[number];

/** Normalize a tab name to a safe filename (lowercase, hyphens, collapsed). */
export function tabToFilename(tab: string): string {
  return tab
    .toLowerCase()
    .replace(/[\/\\]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Group tabs by module area. */
export const MODULE_GROUPS: Record<string, ModuleTab[]> = {
  'core-hr': [
    'Core - Add Pending Workers',
    'Core - Add Non Worker',
    'Core - Create Work Relationship',
    'Core - Hires',
    'Core - One app Pending to Hire',
    'Core - rehires',
    'Core - Assign Change/XFR',
    'Core - Terms/Ends',
  ],
  payroll: ['Payroll'],
};
