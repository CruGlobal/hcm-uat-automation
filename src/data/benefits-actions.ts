/**
 * Benefits action mappings for ESS Benefits tests.
 *
 * Same data-synthesis pattern as leave-actions / salary-actions / bonus-actions
 * / timecard-actions. Most Benefits tests have NO migration-DB row; we synthesize
 * a TestCase at runtime in uat-plan-provider.getFieldData().
 *
 * Wave 1 scope (2026-05-06): BN-042 — Birth life event. The bot has been
 * pre-staged with a "new child" life event manually, so the flow detects the
 * existing pending enrollment and skips the Report step (see
 * executeLifeEventEnrollment guard).
 *
 * Existing flow consumes these fields:
 *   - Plan          → benefits.page selectPlanFromCard (e.g. "Healthcare")
 *   - Option        → coverage tier dropdown (e.g. "Family")
 *   - Dependent     → handleDependents reads tc.testData "dependent: <name>"
 *   - Relationship  → handleDependents reads tc.testData "relationship: <type>"
 *
 * Plan / Option exact values are TBD until the user submits a real enrollment
 * and captures the dropdown contents. For now use plausible defaults — if
 * Oracle rejects, we'll iterate per-test.
 */

export interface BenefitsMapping {
  /** Person Number — required by OutcomeValidator. For ESS tests the bot
   *  acts on its own record, so this is the BOT's person number, not a
   *  separate target person. */
  personNumber: string;
  plan?: string;
  option?: string;
  dependentName?: string;
  dependentRelationship?: string;
}

// Bot person numbers (from src/config/bot-users.ts) for ESS Benefits tests:
//   bot_benefit_admin           — 10817008 (Santi Torres, Jason Price, Melanie Hanlon)
//   bot_hr_admin                — 10816995 (Greg Johnson)
//   bot_line_manager            — 10816992 (Jairo Hernandez)
//   bot_hr_generalist_no_nid    — 10816985 (Amanda Nelson)
//   bot_local_us_capacity       — 10817009 (Lisa Copeland)
//   bot_hr_local_familylife     — 10817006 (Lisa Mitchell)

export const BENEFITS_TESTS: Record<string, BenefitsMapping> = {
  // ── Birth life event (manually-staged on bot_benefit_admin) ──
  'BN-042': {
    personNumber: '10817008',
    plan: 'Healthcare',
    option: 'Family',
    dependentName: 'Test Child',
    dependentRelationship: 'Child',
  },

  // ── View Benefits Summary — view-only ──
  'BN-020': { personNumber: '10816995' }, // Greg Johnson / bot_hr_admin

  // ── Add/update beneficiaries to life plans ──
  'BN-019': { personNumber: '10816995' }, // Greg Johnson / bot_hr_admin
};

export function getBenefitsMapping(testId: string): BenefitsMapping | undefined {
  return BENEFITS_TESTS[testId];
}
