/**
 * Timecard action mappings for Time and Labor (T&L) tests.
 *
 * Like leave-actions / salary-actions / bonus-actions, T&L tests have NO field
 * data in .cache-generated/field-data.json. We synthesize a minimal TestCase at
 * runtime in uat-plan-provider.getFieldData() using the mapping below.
 *
 * For ESS (Employee Self-Service) tests, the bot logs in as itself and opens
 * its OWN timecard — so per-test data only needs the Payroll Time Type.
 * The existing fillFromTestCase already defaults to 8 hours on Monday when no
 * Start/Stop times are provided.
 *
 * Path: Me → Time and Absences → Add Time Card → fill Payroll Time Type +
 * (default 8h on Mon) → Submit. Captured 2026-05-06.
 *
 * Captured Payroll Time Type values:
 *   Regular hours, Overtime Pay, Holiday, Holiday Overtime, Bad Weather Day,
 *   Emergency Pay, Emergency Pay 1_5, Emergency Pay 2_0, Double Time,
 *   Double Time Premium, Meal Penalty, Overtime Premium, Emergency Hours,
 *   Part Time Holiday Pay, Test1
 *
 * Bot pool reality (per recon, 2026-05-06):
 *   - bot_payroll_admin (Matt Gullige, Lisa Franklin, Grace George): can
 *     submit ESS timecards. NO Web Clock buttons. NO Team Time Cards.
 *   - Web Clock tests blocked until bot Clock In/Out role granted.
 *   - Manager Self-Service tests blocked until that bot has Team Time Cards.
 */

export interface TimecardMapping {
  /** Payroll Time Type dropdown value (e.g. "Regular hours", "Overtime Pay") */
  timeType: string;
}

export const TIMECARD_TESTS: Record<string, TimecardMapping> = {
  // ── Timecard Entry (ESS) — weekly timecard with Regular hours ──
  'TL-008': { timeType: 'Regular hours' },
  'TL-010': { timeType: 'Regular hours' },
  'TL-012': { timeType: 'Regular hours' },

  // ── Timecard Attestation (ESS) ── attestation flow opens existing timecard;
  // Time Type isn't strictly used but kept for fallback paths.
  'TL-016': { timeType: 'Regular hours' },

  // ── Timecard Validation (ESS) — Regular hours with default 8h trigger
  // validation rules; specific rule-violation tests can override later.
  'TL-018': { timeType: 'Regular hours' },
};

export function getTimecardMapping(testId: string): TimecardMapping | undefined {
  return TIMECARD_TESTS[testId];
}
