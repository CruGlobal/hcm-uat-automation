/**
 * Salary action mappings for HR-419..432 ("Pay Change ... — Use Change Salary
 * link under Compensation").
 *
 * Like leave-actions, these tests have NO field data in
 * .cache-generated/field-data.json — the UAT spreadsheet only describes the
 * scenario in prose. We synthesize a TestCase at runtime in
 * uat-plan-provider.getFieldData() using the mapping below.
 *
 * Action / Reason values were captured from Oracle HCM stafflife-icahjb-test on
 * 2026-05-02 by Vyshnavi (Person Management → Compensation → Change Salary →
 * Action / Action Reason dropdowns). "Merit" is used as the default reason —
 * it's the canonical reason for a pay change in this Oracle env.
 *
 * Salary Basis is left for Oracle to auto-populate per person type (e.g.
 * Hourly persons get "US Hourly" automatically); we only set Salary Amount.
 *
 * Notes:
 * - 5 of 14 tests are Manager Self-Service (HR-419/422/425/428/431). Those
 *   bots (Nancy Eavenson, Kelly Verge) lack Person Management access, so
 *   those tests will fail loudly via the assignment-change Fix A pattern
 *   until a Manager Self-Service path is built.
 * - Salary amounts are conservative test values; if Oracle rejects (range
 *   validation), adjust per-test.
 */

export interface SalaryMapping {
  action: string;
  reason: string;
  personNumber: string;
  personName: string;
  salaryAmount: string;
}

export const SALARY_TESTS: Record<string, SalaryMapping> = {
  // ── Pay Change Hourly ──
  'HR-419': { action: 'Change Salary', reason: 'Merit', personNumber: '10469553', personName: 'Gladney, Paul', salaryAmount: '36.00' },
  'HR-420': { action: 'Change Salary', reason: 'Merit', personNumber: '10469553', personName: 'Gladney, Paul', salaryAmount: '36.00' },
  'HR-421': { action: 'Change Salary', reason: 'Merit', personNumber: '10793489', personName: 'Jones, Paul', salaryAmount: '36.00' },

  // ── Pay Change Salaried ──
  'HR-422': { action: 'Change Salary', reason: 'Merit', personNumber: '10432592', personName: 'Konstanski, Paul', salaryAmount: '75000.00' },
  'HR-423': { action: 'Change Salary', reason: 'Merit', personNumber: '10432592', personName: 'Konstanski, Paul', salaryAmount: '75000.00' },
  'HR-424': { action: 'Change Salary', reason: 'Merit', personNumber: '10007529', personName: 'Copeland, Scott', salaryAmount: '75000.00' },

  // ── Pay Change Intern ──
  'HR-425': { action: 'Change Salary', reason: 'Merit', personNumber: '10820156', personName: 'Intern, Ivan', salaryAmount: '20.00' },
  'HR-426': { action: 'Change Salary', reason: 'Merit', personNumber: '10820156', personName: 'Intern, Ivan', salaryAmount: '20.00' },
  'HR-427': { action: 'Change Salary', reason: 'Merit', personNumber: '10820156', personName: 'Intern, Ivan', salaryAmount: '20.00' },

  // ── Pay Change PTFS ──
  'HR-428': { action: 'Change Salary', reason: 'Merit', personNumber: '10437086', personName: 'Hershey, Scott', salaryAmount: '50000.00' },
  'HR-429': { action: 'Change Salary', reason: 'Merit', personNumber: '10437086', personName: 'Hershey, Scott', salaryAmount: '50000.00' },
  'HR-430': { action: 'Change Salary', reason: 'Merit', personNumber: '10437086', personName: 'Hershey, Scott', salaryAmount: '50000.00' },

  // ── Pay Change for Staff ──
  'HR-431': { action: 'Change Salary', reason: 'Merit', personNumber: '10438705', personName: 'Bartelt, Scott', salaryAmount: '55000.00' },
  'HR-432': { action: 'Change Salary', reason: 'Merit', personNumber: '10461540', personName: 'Bentley, Scott', salaryAmount: '55000.00' },
};

export function getSalaryMapping(testId: string): SalaryMapping | undefined {
  return SALARY_TESTS[testId];
}
