/**
 * Bonus action mappings for HR-439..454 ("Add Bonus to ... — use Compensation
 * → Individual Compensation → Award Compensation").
 *
 * Like leave-actions and salary-actions, these tests have NO field data in
 * .cache-generated/field-data.json. We synthesize a TestCase at runtime in
 * uat-plan-provider.getFieldData() using the mapping below.
 *
 * Path captured from Oracle HCM stafflife-icahjb-test 2026-05-02:
 *   Person Management → row Actions ▼ → Compensation → Individual Compensation
 *   → Award Compensation button → fill Plan + Option + amount → OK → Save
 *
 * Award Compensation dialog dropdowns:
 *   Plan: only "Bonus" exists in this env
 *   Option (under Bonus): Relocation Bonus / Across Team / Short Term / Wide
 *   Amount field: typed numeric value
 *
 * BPs differ by employment type (Hourly / Salaried) and bonus magnitude
 * (less than 500 / greater than 500), so amounts are picked accordingly.
 *
 * Note: 8 of 16 tests are Manager Self-Service (HR-439/440/443/444/447/448/451/452).
 * Those bots (Nancy Eavenson, Kelly Murray, Bethany George, Phil Stump) may or
 * may not have Person Management access — Phil Stump's bot does, the others
 * (Nancy, Bethany) likely don't. Failing-loudly is the right behavior here.
 */

export interface BonusMapping {
  plan: string;
  option: string;
  amount: string;
  personNumber: string;
  personName: string;
}

export const BONUS_TESTS: Record<string, BonusMapping> = {
  // ── Hourly + Bonus < $500 ──
  'HR-439': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10469553', personName: 'Gladney, Paul' },
  'HR-440': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10469553', personName: 'Gladney, Paul' },
  'HR-441': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10793489', personName: 'Jones, Paul' },
  'HR-442': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10793489', personName: 'Jones, Paul' },

  // ── Hourly + Bonus > $500 ──
  'HR-443': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10469553', personName: 'Gladney, Paul' },
  'HR-444': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10469553', personName: 'Gladney, Paul' },
  'HR-445': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10793489', personName: 'Jones, Paul' },
  'HR-446': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10793489', personName: 'Jones, Paul' },

  // ── Salaried + Bonus < $500 ──
  'HR-447': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10432592', personName: 'Konstanski, Paul' },
  'HR-448': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10432592', personName: 'Konstanski, Paul' },
  'HR-449': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10007529', personName: 'Copeland, Scott' },
  'HR-450': { plan: 'Bonus', option: 'Across Team', amount: '250', personNumber: '10007529', personName: 'Copeland, Scott' },

  // ── Salaried + Bonus > $500 ──
  'HR-451': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10432592', personName: 'Konstanski, Paul' },
  'HR-452': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10432592', personName: 'Konstanski, Paul' },
  'HR-453': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10007529', personName: 'Copeland, Scott' },
  'HR-454': { plan: 'Bonus', option: 'Across Team', amount: '750', personNumber: '10007529', personName: 'Copeland, Scott' },
};

export function getBonusMapping(testId: string): BonusMapping | undefined {
  return BONUS_TESTS[testId];
}
