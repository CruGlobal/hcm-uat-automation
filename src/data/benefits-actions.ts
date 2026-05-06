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
  plan?: string;
  option?: string;
  dependentName?: string;
  dependentRelationship?: string;
}

export const BENEFITS_TESTS: Record<string, BenefitsMapping> = {
  // ── Birth life event (the manually-staged event) ──
  'BN-042': {
    plan: 'Healthcare',
    option: 'Family',
    dependentName: 'Test Child',
    dependentRelationship: 'Child',
  },

  // ── View Benefits Summary — view-only, no fill needed ──
  'BN-020': {},

  // ── Add/update beneficiaries to life plans — no plan election needed,
  // beneficiary handled separately via handleBeneficiaries ──
  'BN-019': {},
};

export function getBenefitsMapping(testId: string): BenefitsMapping | undefined {
  return BENEFITS_TESTS[testId];
}
