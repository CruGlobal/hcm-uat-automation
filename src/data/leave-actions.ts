/**
 * Leave action mappings for HR-303..322 ("Use Change Assignment" → leave BPs).
 *
 * These tests have NO field data in .cache-generated/field-data.json — the UAT
 * spreadsheet only describes the scenario in prose. We synthesize a TestCase at
 * runtime in uat-plan-provider.getFieldData() using the mapping below.
 *
 * Action / Reason values were captured from Oracle HCM stafflife-icahjb-test on
 * 2026-05-02 by Vyshnavi (Person Management → Update Employment dialog).
 *
 * Key constraints:
 * - "Return from Leave" has NO Action Reason in this env — the dropdown is empty.
 *   The flow must skip the reason field for that action.
 * - Each test is mapped to a UNIQUE person to avoid state collisions when running
 *   tests in parallel (one person can only be in one leave state at a time).
 *
 * Person numbers were sourced from active employee search results provided by
 * Vyshnavi (John / Paul / Scott searches) on 2026-05-02. Hourly + Salaried pools
 * are small (2 each), so most tests use general "Employee - Staff" persons. The
 * BP wording ("Hourly FT to ...") describes the scenario but does not constrain
 * which Oracle person types can receive the action.
 */

export interface LeaveMapping {
  action: string;
  reason: string | null; // null = Return from Leave (no reason needed)
  personNumber: string;
  personName: string;    // "Last, First" format as shown in Oracle search results
}

export const LEAVE_TESTS: Record<string, LeaveMapping> = {
  // ── Hourly FT → Paid Leave ──
  'HR-303': { action: 'Paid Leave', reason: 'Paid Personal', personNumber: '10469553', personName: 'Gladney, Paul' },
  'HR-304': { action: 'Paid Leave', reason: 'Paid Personal', personNumber: '10793489', personName: 'Jones, Paul' },

  // ── Hourly FT → Unpaid Leave ── (only 2 Hourly persons available, using Staff for these)
  'HR-305': { action: 'Unpaid Leave', reason: 'Unpaid Personal', personNumber: '10438705', personName: 'Bartelt, Scott' },
  'HR-306': { action: 'Unpaid Leave', reason: 'Unpaid Personal', personNumber: '10461540', personName: 'Bentley, Scott' },

  // ── Hourly FT → Return from Leave ──
  'HR-307': { action: 'Return from Leave', reason: null, personNumber: '10448364', personName: 'Berkey, Scott' },
  'HR-308': { action: 'Return from Leave', reason: null, personNumber: '10000648', personName: 'Caster, Scott' },

  // ── Salaried FT → Paid Leave ──
  'HR-309': { action: 'Paid Leave', reason: 'Paid Personal', personNumber: '10432592', personName: 'Konstanski, Paul' },
  'HR-310': { action: 'Paid Leave', reason: 'Paid Personal', personNumber: '10007529', personName: 'Copeland, Scott' },

  // ── Salaried FT → Unpaid Leave ── (using Staff persons)
  'HR-311': { action: 'Unpaid Leave', reason: 'Unpaid Personal', personNumber: '10455487', personName: 'Crocker, Scott' },
  'HR-312': { action: 'Unpaid Leave', reason: 'Unpaid Personal', personNumber: '10447505', personName: 'Debruyne, Scott' },

  // ── Salaried FT → Return from Leave ──
  'HR-313': { action: 'Return from Leave', reason: null, personNumber: '10001186', personName: 'Downey, Scott' },
  'HR-314': { action: 'Return from Leave', reason: null, personNumber: '10000088', personName: 'Ebsen, Scott' },

  // ── Supported RMO → Sabbatical ── (Paid Leave with 90-Day Sabbatical reason)
  'HR-315': { action: 'Paid Leave', reason: 'Paid 90-Day Sabbatical', personNumber: '10444041', personName: 'Goode, Scott' },
  'HR-316': { action: 'Paid Leave', reason: 'Paid 90-Day Sabbatical', personNumber: '10012514', personName: 'Kelsay, Scott' },

  // ── Supported RMO → Medical Leave ──
  'HR-317': { action: 'Unpaid Leave', reason: 'Unpaid Medical (non-FMLA)', personNumber: '10454434', personName: 'Book, John' },
  'HR-318': { action: 'Unpaid Leave', reason: 'Unpaid Medical (non-FMLA)', personNumber: '10440683', personName: 'Boudreaux, John' },

  // ── Supported RMO → Military Leave ──
  'HR-319': { action: 'Unpaid Leave', reason: 'Unpaid Military Service', personNumber: '10433950', personName: 'Broesamle, John' },
  'HR-320': { action: 'Unpaid Leave', reason: 'Unpaid Military Service', personNumber: '10002490', personName: 'Corrigan, John' },

  // ── Supported RMO → Return from Leave ──
  'HR-321': { action: 'Return from Leave', reason: null, personNumber: '10742568', personName: 'Cross, John' },
  'HR-322': { action: 'Return from Leave', reason: null, personNumber: '10431262', personName: 'Douglass, John' },
};

export function getLeaveMapping(testId: string): LeaveMapping | undefined {
  return LEAVE_TESTS[testId];
}
