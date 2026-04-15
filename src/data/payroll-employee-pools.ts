/**
 * Rotating employee pools for off-cycle payroll tests.
 * Each test picks a different employee per run using RUN_COUNTER % pool.length,
 * preventing duplicate element entry conflicts across runs.
 */

// ── Reusable base pools by organization / pay type ──

/** CCC (Campus Crusade for Christ) — non-leadership support staff */
const CCC_SUPPORT: string[] = [
  'John Greene',
  'Thomas Weakley',
  'Debra Johnson',
  'Michelle Allen',
  'Michael Uno',
  'Christina Kingsley',
  'Anne Miller',
  'Suzette Brown',
];

/** CCC — salaried (non-leadership) employees */
const CCC_SALARIED: string[] = [
  'Sylvia Shaquanie',
  'Kevin Larrett',
  'Avis Hipp',
  'Peter Offerman',
  'Jenifer Eberle',
  'Matthew Eberle',
  'Angela Aldridge',
  'Jennifer Herr',
  'Larry Hauer',
  'Mary Felsted',
  'Kevin Vancour',
];

/** GCE — Global Coastal Enterprises, Inc. (Semimonthly Supported staff) */
const GCE: string[] = [
  'Edward Maggard',
  'Lionel Goo',
  'Paulette Thomas',
  'Jason Connolly',
  'Jessica Villie',
  'Laura Schriver',
  'Jonathan Alling',
  'Laurie Morell',
];

/** RCE — Resources for Intercultural Exchange, Inc. (Semimonthly Supported staff) */
const RCE: string[] = [
  'Ted Yuan',
  'Matthew Cheung',
  'William Campbell',
  'Christopher Gaertner',
  'Yen Hei Suwidji',
  'Alicia Talley',
  'Fan Xu',
  'Anna Ellis',
];

/**
 * Test-ID → employee pool mapping.
 * Each test rotates through its pool by RUN_COUNTER % pool.length.
 */
export const PAYROLL_EMPLOYEE_POOLS: Record<string, string[]> = {
  // PY-002: Unpaid Leave — salaried employee
  'PY-002': CCC_SALARIED,
  // PY-004: Short Pay — CCC supported staff
  'PY-004': CCC_SUPPORT,
  // PY-009 series: off-cycle additional salary
  'PY-009-01': CCC_SUPPORT, // CCC support
  'PY-009-02': GCE,         // GCE
  'PY-009-03': RCE,         // RCE
  'PY-009-04': CCC_SUPPORT, // Additional Salary 403b Employee Results — CCC support
  'PY-009-05': GCE,         // Additional Salary 403b Employee Results — GCE
  'PY-009-06': RCE,         // Additional Salary 403b Employee Results — RCE
  // PY-011 series: 25-year awards / wellness checks
  'PY-011-02': CCC_SALARIED, // Bonus - 25 Years (cru salaried)
  'PY-011-03': CCC_SALARIED, // Additional Salary with "wellness bonus" reason
};

/**
 * Payroll group (dropdown value) for off-cycle flow submission per test.
 * Used when submitting "Cru Offcycle Payroll Flow" — Step 2 of off-cycle payroll.
 * Kept for manual HR batch runs; automated tests now use QuickPay.
 */
export const PAYROLL_GROUP_BY_TEST: Record<string, string> = {
  'PY-009-01': 'Semimonthly Supported',
  'PY-009-02': 'Semimonthly Supported',
  'PY-009-03': 'Semimonthly Supported',
};

/**
 * Element name overrides (test-ID → element name).
 * Applied by uat-plan-provider.getFieldData() — overrides the "Element name" field
 * value from the migration DB. Used when migration data has the wrong element
 * (e.g., "Housing Allowance" placeholder) or when a test needs a specific element.
 */
export const PAYROLL_ELEMENT_OVERRIDES: Record<string, string> = {
  // PY-002: Unpaid Leave
  'PY-002': 'Unpaid Leave',
  // PY-004: Short Pay
  'PY-004': 'Short Pay',
  // PY-009 additional salary
  'PY-009-01': 'Additional Salary',
  'PY-009-02': 'Additional Salary',
  'PY-009-03': 'Additional Salary',
  // PY-009-04/05/06: 403b Employee Results additional salary
  'PY-009-04': 'Additional Salary 403b Employee Results',
  'PY-009-05': 'Additional Salary 403b Employee Results',
  'PY-009-06': 'Additional Salary 403b Employee Results',
  // PY-011-02: 25-year award bonus
  'PY-011-02': 'Bonus - 25 Years',
  // PY-011-03: Wellness bonus (element is Additional Salary, reason is "wellness bonus")
  'PY-011-03': 'Additional Salary',
};

/**
 * Reason field overrides (test-ID → reason text).
 * Applied by uat-plan-provider.getFieldData() — overrides the "Reason" field.
 */
export const PAYROLL_REASON_OVERRIDES: Record<string, string> = {
  'PY-011-03': 'wellness bonus',
};

/**
 * Extra element names to check in QuickPay in addition to the primary element.
 * Primary element comes from PAYROLL_ELEMENT_OVERRIDES (or migration DB).
 * Fixed elements (SECA Tax Deduction Info, Pre Tax 403B) are always added.
 * This map is for tests that need MORE than the primary + fixed set.
 */
export const PAYROLL_QUICKPAY_EXTRA_ELEMENTS: Record<string, string[]> = {
  // PY-009-05 (GCE) also checks "403b Employee Results" in addition to
  // "Additional Salary 403b Employee Results"
  'PY-009-05': ['403b Employee Results'],
};

/**
 * Pick an employee from the pool for a given test ID using run counter rotation.
 * Returns undefined if no pool exists for the test ID.
 */
export function pickEmployeeFromPool(testId: string, runCounter: number): string | undefined {
  const pool = PAYROLL_EMPLOYEE_POOLS[testId];
  if (!pool || pool.length === 0) return undefined;
  return pool[runCounter % pool.length];
}
