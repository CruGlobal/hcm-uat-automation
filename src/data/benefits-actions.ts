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

/**
 * Pool of persons by scenario state, sourced from Person Management search
 * results 2026-05-07. Populated for Wave 2 (real Admin / ESS work) — not
 * actively used in current nav-only mode but kept here as the canonical
 * mapping when we wire submit/plan-fill logic back in.
 *
 * Gaps still missing: terminated employees, international assignees (not
 * interns), currently-on-military-leave, age-specific (LTD-71/Life-80).
 */
export const BENEFITS_PERSON_POOL = {
  // Pre-staged life event — gold-mine for life-event admin tests
  PRESTAGED_LIFE_EVENT: { number: '10820202', name: 'Cru_New_Hire, Life_Event' },

  // Active full-time salaried
  ACTIVE_SALARIED: [
    { number: '10720312', name: 'New, Madison' },
  ],

  // Active full-time staff (RMO / non-RMO Spouse)
  ACTIVE_STAFF: [
    { number: '10816788', name: 'Integrationtest, Another' },
    { number: '10004808', name: 'Snider, Paul' },
    { number: '10742568', name: 'Cross, John' },           // non-RMO Spouse
    { number: '10000460', name: 'Helmer, John' },          // non-RMO Spouse
    { number: '10764249', name: 'Jenkins, John' },
    { number: '10456100', name: 'Karraker, John' },
    { number: '10427402', name: 'Lamb, John' },
    { number: '10440789', name: 'Lancaster, John' },
    { number: '10446207', name: 'Mackin, John' },
    { number: '10449866', name: 'Miller, G. Paul' },
    { number: '10011998', name: 'Lindberg, Paul' },
    { number: '10000088', name: 'Ebsen, Scott' },
    { number: '10444041', name: 'Goode, Scott' },
    { number: '10454929', name: 'Kral, Scott' },
    { number: '10441973', name: 'Moffatt, Scott' },
    { number: '10439539', name: 'Mottice, Scott' },
    { number: '10463337', name: 'Pearson, Scott' },
    { number: '10432159', name: 'Petersen, Donald' },
    { number: '10429083', name: 'Scott, Lois' },
  ],

  // PTFS (Part-Time Field Staff) — for reclass tests
  PTFS: [
    { number: '10437086', name: 'Hershey, Scott' },
    { number: '10454702', name: 'Holst, John' },
    { number: '10788665', name: 'Gonzalez, Karisia' },
    { number: '10800796', name: 'John, Hannah' },
    { number: '10444654', name: 'Scott, Anne-Fielding' },
  ],

  // US Interns
  US_INTERN: [
    { number: '10800170', name: 'Hargette, Paul' },
    { number: '10786513', name: 'Mcadoo, John' },
    { number: '10820156', name: 'Intern, Ivan' },
    { number: '10787424', name: 'Scott, Kenzie' },
  ],

  // International Interns
  INTL_INTERN: [
    { number: '10816752', name: 'DNU HR-059, International Intern' },
    { number: '10816787', name: 'HR-005, Intl Intern' },              // pending
  ],

  // Field Staff (national / regional)
  FIELD_STAFF: [
    { number: '10470062', name: 'Lewis, Paul' },                       // LAC Regional
    { number: '10449933', name: 'Mainzinger, Paul' },
    { number: '10443966', name: 'Malicki, Paul' },                     // National
  ],

  // Volunteers / Non-workers (for "no benefits" / staff emeritus paths)
  VOLUNTEER_OR_EMERITUS: [
    { number: '10425993', name: 'Barger, Paul' },                      // Staff Emeritus
    { number: '10434012', name: 'Dickerman, John' },                   // Volunteer
    { number: '10749178', name: 'Griffin, Paul' },                     // NMBHR
    { number: '10427679', name: 'Luley, Scott' },                      // Staff Emeritus
  ],
} as const;

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
