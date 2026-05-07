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
  /** Person display name (Last, First) — useful for log lines */
  personName?: string;
  plan?: string;
  option?: string;
  dependentName?: string;
  dependentRelationship?: string;
  /** Life event type for life-event tests (Marriage, Birth, Adoption, Divorce, Death) */
  lifeEventType?: string;
  /** Free-form scenario hint for log lines / Wave 2 routing */
  scenarioNote?: string;
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

// Helpers for compact mapping construction below
const AS = BENEFITS_PERSON_POOL.ACTIVE_STAFF;
const PT = BENEFITS_PERSON_POOL.PTFS;
const UI = BENEFITS_PERSON_POOL.US_INTERN;
const II = BENEFITS_PERSON_POOL.INTL_INTERN;
const SAL = BENEFITS_PERSON_POOL.ACTIVE_SALARIED;
const VOL = BENEFITS_PERSON_POOL.VOLUNTEER_OR_EMERITUS;
const FS = BENEFITS_PERSON_POOL.FIELD_STAFF;
const PLE = BENEFITS_PERSON_POOL.PRESTAGED_LIFE_EVENT;

/** Build a mapping from a pool entry + extras */
function pm(p: { number: string; name: string }, extras: Partial<BenefitsMapping> = {}): BenefitsMapping {
  return { personNumber: p.number, personName: p.name, ...extras };
}

/**
 * All 139 Benefits tests mapped to a person from the pool + scenario metadata.
 *
 * Person assignment was made by reading each test's businessProcess +
 * testScenario and matching to the appropriate pool category (active staff,
 * PTFS, intern, etc.). Where the pool has no exact match (terminated workers,
 * age-71 LTD persons, military leave), we fall back to the closest active
 * pool person — those tests will need real data when those gaps are filled.
 *
 * Plan / Option labels remain placeholder values ("Healthcare" / "Family")
 * because the bot's enrollment dropdowns weren't reachable during recon. Once
 * a fresh life event is staged and the wizard plans are visible, these will
 * be updated to exact Oracle labels.
 *
 * Currently consumed only via OutcomeValidator (Person Number lookup). All
 * 139 tests run in nav-pass mode — this data is the foundation for Wave 2.
 */
export const BENEFITS_TESTS: Record<string, BenefitsMapping> = {
  // ── Reclass FT to PT (Admin) ──
  'BN-001': pm(PT[0], { scenarioNote: 'Reclass FT to PT' }),
  'BN-002': pm(PT[1], { scenarioNote: 'Reclass FT to PT' }),

  // ── Age-specific Admin tests (gap: no age-71 / age-80 persons in pool) ──
  'BN-003': pm(AS[0], { scenarioNote: 'LTD termination at 71 (gap: age-specific)' }),
  'BN-004': pm(AS[1], { scenarioNote: 'Basic life decrease at 80 (gap: age-specific)' }),

  // ── RMO 1-year-mark Admin tests ──
  'BN-005': pm(AS[2], { plan: '403(b) Retirement', scenarioNote: 'RMO 403b after 1 year' }),
  'BN-006': pm(AS[3], { plan: 'LTD', scenarioNote: 'RMO LTD after 1 year' }),

  // ── Healthcare / Plan Adjustment Admin ──
  'BN-007': pm(AS[4], { plan: 'Healthcare', option: 'Waive', scenarioNote: 'Waive healthcare' }),
  'BN-008': pm(AS[5], { plan: 'Healthcare', dependentName: 'Test Dependent', dependentRelationship: 'Spouse', scenarioNote: 'Add/remove healthcare dependent' }),
  'BN-009': pm(AS[6], { plan: 'Voluntary Life', scenarioNote: 'Voluntary Life elect/update' }),
  'BN-010': pm(AS[7], { plan: 'Basic Life', scenarioNote: 'Adjust RMO Basic Life' }),
  'BN-011': pm(PLE, { lifeEventType: 'Other', scenarioNote: 'Life event for RMO with spouse on staff' }),

  // ── Continuation / Retirement / Self-Supported Admin ──
  'BN-012': pm(AS[8], { plan: 'Healthcare', scenarioNote: 'Continuation of Coverage (gap: no terminated)' }),
  'BN-013': pm(AS[9], { plan: 'Healthcare', scenarioNote: 'Retirement Healthcare (gap: no retired)' }),
  'BN-014': pm(VOL[0], { plan: 'Healthcare', scenarioNote: 'Self Supported non-employee' }),

  // ── Hawaii regional ESS / Admin ──
  'BN-015': pm(AS[10], { plan: 'Select Healthcare', scenarioNote: 'Hawaii Select plan default' }),
  'BN-016': pm(PT[2], { plan: 'Select Healthcare', scenarioNote: 'Part-time Hawaii' }),

  // ── Disability / PR / View ──
  'BN-017': pm(AS[11], { plan: 'Select Healthcare', scenarioNote: 'RMO on disability' }),
  'BN-018': pm(AS[12], { scenarioNote: 'Puerto Rico transfer (gap: no PR person)' }),
  'BN-019': pm(AS[13], { scenarioNote: 'Add/update beneficiaries' }),
  'BN-020': pm(AS[14], { scenarioNote: 'View Benefits Summary' }),

  // ── Life event corrections (Admin) ──
  'BN-021': pm(PLE, { scenarioNote: 'Correct life event date after processing' }),
  'BN-022': pm(PLE, { scenarioNote: 'Life event added incorrectly' }),
  'BN-023': pm(AS[15], { plan: 'Healthcare', scenarioNote: 'RMO spouse healthcare after spouse term' }),
  'BN-024': pm(AS[16], { scenarioNote: 'Change benefit service date' }),
  'BN-025': pm(AS[17], { plan: 'Spouse Voluntary Life', dependentName: 'Test Spouse', dependentRelationship: 'Spouse', scenarioNote: 'Spouse Vol Life first time' }),
  'BN-026': pm(AS[18], { plan: 'Healthcare', scenarioNote: 'Ministry location reassignment (XFR)' }),

  // ── Death of employee ──
  'BN-027': pm(AS[0], { lifeEventType: 'Death', scenarioNote: 'Death of employee (gap: no terminated)' }),

  // ── Anniversary / hourly flex (Admin) ──
  'BN-028': pm(AS[1], { scenarioNote: 'Hourly 5 year anniversary $500' }),
  'BN-029': pm(AS[2], { scenarioNote: 'Hourly 5/10/15/20 year anniversaries' }),
  'BN-030': pm(PLE, { scenarioNote: 'Adjust finalized life event' }),

  // ── Rehire ESS ──
  'BN-031': pm(AS[3], { scenarioNote: 'Rehire within 1 year FT' }),
  'BN-032': pm(AS[4], { scenarioNote: 'Rehire FT within 1 year of PT' }),

  // ── Termination Admin (gap: no terminated persons in pool) ──
  'BN-033': pm(AS[5], { scenarioNote: 'Terminate RMO first of month (gap)' }),
  'BN-034': pm(AS[6], { scenarioNote: 'Terminate RMO after first (gap)' }),
  'BN-035': pm(UI[0], { scenarioNote: 'Terminate Intern (gap)' }),
  'BN-036': pm(AS[7], { scenarioNote: 'Terminate FT hourly (gap)' }),
  'BN-037': pm(SAL[0], { scenarioNote: 'Terminate FT salaried (gap)' }),
  'BN-038': pm(PT[3], { scenarioNote: 'Terminate PTFS (gap)' }),
  'BN-039': pm(PT[4], { scenarioNote: 'Terminate PT hourly (gap)' }),
  'BN-040': pm(AS[8], { scenarioNote: 'Terminate temporary (gap)' }),

  // ── Life event ESS ──
  'BN-041': pm(PLE, { lifeEventType: 'Marriage', scenarioNote: 'Marriage life event' }),
  'BN-042': pm(PLE, { lifeEventType: 'Birth', dependentName: 'Test Child', dependentRelationship: 'Child', plan: 'Healthcare', option: 'Family', scenarioNote: 'Birth life event' }),
  'BN-043': pm(PLE, { lifeEventType: 'Adoption', dependentName: 'Test Child', dependentRelationship: 'Child', scenarioNote: 'Adoption life event' }),
  'BN-044': pm(AS[9], { lifeEventType: 'Divorce', scenarioNote: 'Divorce life event' }),

  // ── Dependent aging out (Admin) ──
  'BN-045': pm(AS[10], { plan: 'Healthcare', scenarioNote: 'Dep child turns 26 (gap: needs 26-yo dep)' }),
  'BN-046': pm(AS[11], { plan: 'Healthcare', scenarioNote: 'Disabled dep turns 26 (gap)' }),

  // ── New Hire Enrollment ESS / Admin ──
  'BN-047': pm(AS[12], { scenarioNote: 'New Hire RMO' }),
  'BN-048': pm(AS[13], { scenarioNote: 'New Hire RMO secondary' }),
  'BN-049': pm(AS[14], { scenarioNote: 'New Hire RMO waived' }),
  'BN-050': pm(UI[1], { scenarioNote: 'New Hire Intern' }),
  'BN-051': pm(UI[2], { scenarioNote: 'New Hire Intern waives' }),
  'BN-052': pm(AS[15], { scenarioNote: 'New Hire Hourly' }),
  'BN-053': pm(SAL[0], { scenarioNote: 'New Hire Salaried' }),
  'BN-054': pm(PT[0], { scenarioNote: 'New Hire PT Hourly' }),
  'BN-055': pm(PT[1], { scenarioNote: 'New Hire PT Field Staff' }),
  'BN-056': pm(PT[2], { scenarioNote: 'New Hire PT Hourly Temporary' }),

  // ── Rehire Enrollment ESS / Admin ──
  'BN-057': pm(AS[16], { scenarioNote: 'Rehire RMO' }),
  'BN-058': pm(AS[17], { scenarioNote: 'Rehire RMO secondary' }),
  'BN-059': pm(AS[18], { scenarioNote: 'Rehire RMO waived' }),
  'BN-060': pm(UI[3], { scenarioNote: 'Rehire Intern' }),
  'BN-061': pm(UI[0], { scenarioNote: 'Rehire Intern waives' }),
  'BN-062': pm(AS[0], { scenarioNote: 'Rehire Hourly' }),
  'BN-063': pm(SAL[0], { scenarioNote: 'Rehire Salaried' }),
  'BN-064': pm(PT[3], { scenarioNote: 'Rehire PT Hourly' }),
  'BN-065': pm(PT[4], { scenarioNote: 'Rehire PT Field Staff' }),
  'BN-066': pm(AS[1], { scenarioNote: 'Rehire Temporary' }),

  // ── Rehire within year of FT enrollment ESS ──
  'BN-067': pm(AS[2], { scenarioNote: 'Rehire <1yr FT RMO' }),
  'BN-068': pm(AS[3], { scenarioNote: 'Rehire <1yr FT RMO secondary' }),
  'BN-069': pm(AS[4], { scenarioNote: 'Rehire <1yr RMO waived' }),
  'BN-070': pm(UI[1], { scenarioNote: 'Rehire <1yr Intern' }),
  'BN-071': pm(UI[2], { scenarioNote: 'Rehire <1yr Intern waives' }),
  'BN-072': pm(AS[5], { scenarioNote: 'Rehire <1yr Hourly' }),
  'BN-073': pm(SAL[0], { scenarioNote: 'Rehire <1yr Salaried' }),

  // ── Job Reclass Admin / ESS ──
  'BN-074': pm(PT[0], { scenarioNote: 'Reclass FT RMO to PT RMO' }),
  'BN-075': pm(AS[6], { scenarioNote: 'Reclass FT RMO to FT Hourly' }),
  'BN-076': pm(SAL[0], { scenarioNote: 'Reclass FT RMO to FT Salaried' }),
  'BN-077': pm(AS[7], { scenarioNote: 'Reclass Intern to FT RMO' }),
  'BN-078': pm(II[0], { scenarioNote: 'Reclass US Intern to Overseas Intern' }),
  'BN-079': pm(PT[1], { scenarioNote: 'Reclass Intern to PT Field Staff' }),
  'BN-080': pm(UI[3], { scenarioNote: 'Reclass PT Field Staff to Intern' }),
  'BN-081': pm(AS[8], { scenarioNote: 'Reclass PT Field Staff to FT RMO' }),
  'BN-082': pm(AS[9], { scenarioNote: 'Reclass PT Field Staff to FT Salaried Temp' }),
  'BN-083': pm(PT[2], { scenarioNote: 'Reclass FT Salaried Temp to PT Field Staff' }),
  'BN-084': pm(PT[3], { scenarioNote: 'Reclass FT Salaried to PT Hourly' }),
  'BN-085': pm(AS[10], { scenarioNote: 'Reclass FT Salaried to FT Hourly' }),
  'BN-086': pm(PT[4], { scenarioNote: 'Reclass FT Salaried to PT Field Staff' }),
  'BN-087': pm(SAL[0], { scenarioNote: 'Reclass FT Hourly to FT Salaried' }),
  'BN-088': pm(AS[11], { scenarioNote: 'Reclass FT Hourly to FT RMO' }),
  'BN-089': pm(PT[0], { scenarioNote: 'Reclass FT Hourly to PT Hourly' }),
  'BN-090': pm(AS[12], { scenarioNote: 'Reclass FT Hourly to Hourly on Call' }),
  'BN-091': pm(AS[13], { scenarioNote: 'Reclass PT Hourly to FT Hourly' }),
  'BN-092': pm(AS[14], { scenarioNote: 'Reclass PT Hourly to Hourly on Call' }),
  'BN-093': pm(AS[15], { scenarioNote: 'Reclass PT Hourly to FT RMO' }),
  'BN-094': pm(PT[1], { scenarioNote: 'Reclass PT Hourly to PT Supported Staff' }),
  'BN-095': pm(SAL[0], { scenarioNote: 'Reclass PT Salaried to FT Salaried' }),
  'BN-096': pm(PT[2], { scenarioNote: 'Reclass PT Salaried to PT Hourly' }),
  'BN-097': pm(AS[16], { scenarioNote: 'Reclass Hourly FT Temp to Hourly On Call' }),
  'BN-098': pm(AS[17], { scenarioNote: 'Reclass Hourly FT Temp to Hourly FT' }),
  'BN-099': pm(PT[3], { scenarioNote: 'Reclass Hourly FT Temp to Hourly PT' }),
  'BN-100': pm(PT[4], { scenarioNote: 'Reclass Hourly PT Temp to Hourly PT' }),
  'BN-101': pm(AS[18], { scenarioNote: 'Reclass Hourly On Call to Hourly FT' }),
  'BN-102': pm(SAL[0], { scenarioNote: 'Reclass Hourly PT Temp to FT Salaried' }),
  'BN-103': pm(AS[0], { scenarioNote: 'Reclass Hourly On Call to Hourly FT Temp' }),
  'BN-104': pm(AS[1], { scenarioNote: 'Reclass Hourly PT Temp to Hourly On Call' }),

  // ── Two RMOs marriage ──
  'BN-105': pm(AS[2], { lifeEventType: 'Marriage', scenarioNote: 'Two RMOs marry' }),

  // ── Unpaid LOA Admin ──
  'BN-106': pm(AS[3], { scenarioNote: 'Unpaid LOA Hourly' }),
  'BN-107': pm(SAL[0], { scenarioNote: 'Unpaid LOA Salaried' }),
  'BN-108': pm(AS[4], { scenarioNote: 'Unpaid LOA RMO' }),
  'BN-109': pm(UI[1], { scenarioNote: 'Unpaid LOA Intern' }),
  'BN-110': pm(PT[0], { scenarioNote: 'Unpaid LOA PTFS' }),

  // ── 403(b) Admin ──
  'BN-111': pm(AS[5], { plan: '403(b) Retirement', scenarioNote: '403b Hiring code to Principal' }),
  'BN-112': pm(AS[6], { plan: '403(b) Retirement', scenarioNote: '403b date of eligibility' }),
  'BN-113': pm(AS[7], { plan: '403(b) Retirement', scenarioNote: '403b SCP terminations (gap)' }),

  // ── BENADM fee / view ──
  'BN-114': pm(AS[8], { plan: 'Healthcare', option: 'Waive', scenarioNote: 'BENADM fee on RMO waive' }),
  'BN-115': pm(AS[9], { scenarioNote: 'View benefits via ESS' }),
  'BN-116': pm(AS[10], { scenarioNote: 'HR Spec views benefit elections' }),
  'BN-117': pm(VOL[1], { plan: 'Healthcare', scenarioNote: 'Self-Supported non-employee setup' }),

  // ── Continuation / 403(b) catch-up ──
  'BN-118': pm(AS[11], { plan: 'Healthcare', scenarioNote: 'Dependent ages out → CCV' }),
  'BN-119': pm(AS[12], { plan: '403(b) Retirement', scenarioNote: '403b age catch-up limits' }),
  'BN-120': pm(AS[13], { plan: '403(b) Retirement', scenarioNote: '403b $150K Roth catch-up' }),

  // ── International Assignment Admin / ESS (gap: no non-intern intl persons) ──
  'BN-121': pm(II[0], { scenarioNote: 'Moved from Intl Assignment (intern)' }),
  'BN-122': pm(UI[2], { scenarioNote: 'Moved to Intl Assignment (intern)' }),
  'BN-123': pm(AS[14], { scenarioNote: 'Moved from Intl Assignment (RMO) (gap)' }),
  'BN-124': pm(AS[15], { scenarioNote: 'Moved to Intl Assignment (RMO) (gap)' }),
  'BN-125': pm(II[1], { scenarioNote: 'Moved from Intl Assignment (intern)' }),
  'BN-126': pm(UI[3], { scenarioNote: 'Moved to Intl Assignment (intern)' }),
  'BN-127': pm(AS[16], { scenarioNote: 'Moved from Intl Assignment (RMO) (gap)' }),
  'BN-128': pm(AS[17], { scenarioNote: 'Moved to Intl Assignment (RMO) (gap)' }),

  // ── Subsidiary / Military / Reprocess / Confirmation ──
  'BN-129': pm(AS[18], { scenarioNote: 'Subsidiary employee hire' }),
  'BN-130': pm(AS[0], { scenarioNote: 'Military leave > 31 days (gap)' }),
  'BN-131': pm(AS[1], { scenarioNote: 'Reprocess HIR/REH/PTF' }),
  'BN-132': pm(AS[2], { scenarioNote: 'Confirmation statement (ESS)' }),
  'BN-133': pm(AS[3], { scenarioNote: 'Confirmation statement (Admin)' }),
  'BN-134': pm(AS[4], { scenarioNote: 'Military leave < 31 days (gap)' }),

  // ── Hourly Flex Benefits ESS ──
  'BN-135': pm(AS[5], { plan: 'Hourly Flex', scenarioNote: 'Flex 2 years service' }),
  'BN-136': pm(AS[6], { plan: 'Hourly Flex', scenarioNote: 'Flex 5/10/15 anniversary' }),
  'BN-137': pm(AS[7], { plan: 'Hourly Flex', scenarioNote: 'Flex medical credit limits' }),

  // ── Termination after first of month (gap: no terminated) ──
  'BN-138': pm(AS[8], { scenarioNote: 'Terminate FT hourly after 1st (gap)' }),
  'BN-139': pm(SAL[0], { scenarioNote: 'Terminate FT salaried after 1st (gap)' }),
};

export function getBenefitsMapping(testId: string): BenefitsMapping | undefined {
  return BENEFITS_TESTS[testId];
}
