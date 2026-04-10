/**
 * Rotating employee pools for off-cycle payroll tests.
 * Each test picks a different employee per run using RUN_COUNTER % pool.length,
 * preventing duplicate element entry conflicts across runs.
 *
 * PY-009-01: CCC (Cru) — Support staff
 * PY-009-02: GCE (Global Coastal Enterprises, Inc.)
 * PY-009-03: RCE (Resources for Intercultural Exchange, Inc.)
 */
export const PAYROLL_EMPLOYEE_POOLS: Record<string, string[]> = {
  'PY-009-01': [
    // CCC — Campus Crusade for Christ, Inc. — non-leadership salaried employees
    // Excluded: team leads and leadership roles (cannot receive additional salary from admin bot)
    'John Greene',
    // Vyshnavi Reddy Kamballapally excluded — leadership role
    'Thomas Weakley',
    'Debra Johnson',
    'Michelle Allen',
    'Michael Uno',
    'Christina Kingsley',
    'Anne Miller',
    'Suzette Brown',
  ],
  'PY-009-02': [
    // GCE — Global Coastal Enterprises, Inc.
    'Edward Maggard',
    'Lionel Goo',
    'Paulette Thomas',
    'Jason Connolly',
    'Jessica Villie',
    'Laura Schriver',
    'Jonathan Alling',
    'Laurie Morell',
  ],
  'PY-009-03': [
    // RCE — Resources for Intercultural Exchange, Inc.
    'Ted Yuan',
    'Matthew Cheung',
    'William Campbell',
    'Christopher Gaertner',
    'Yen Hei Suwidji',
    'Alicia Talley',
    'Fan Xu',
    'Anna Ellis',
  ],
};

/**
 * Payroll group (dropdown value) for off-cycle flow submission per test.
 * Used when submitting "Cru Offcycle Payroll Flow" — Step 2 of off-cycle payroll.
 * Must match exactly the gridcell label in Oracle HCM.
 */
export const PAYROLL_GROUP_BY_TEST: Record<string, string> = {
  'PY-009-01': 'Semimonthly Supported', // CCC — Support staff
  'PY-009-02': 'Semimonthly Supported', // GCE — Global Coastal Enterprises (staff, not salaried)
  'PY-009-03': 'Semimonthly Supported', // RCE — Resources for Intercultural Exchange (staff, not salaried)
};

/**
 * Element name overrides for off-cycle payroll tests.
 * The migration DB field data has "Housing Allowance" for these tests which is wrong.
 * These tests create an "Additional Salary" element entry, not Housing Allowance.
 */
export const PAYROLL_ELEMENT_OVERRIDES: Record<string, string> = {
  'PY-009-01': 'Additional Salary',
  'PY-009-02': 'Additional Salary',
  'PY-009-03': 'Additional Salary',
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
