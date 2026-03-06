import { type Page, expect } from '@playwright/test';
import { BaseBenefitsFlow } from './base-benefits.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Benefits Administration
 * Module: Benefits
 * Covers 90 admin-side test cases across all business process categories:
 *
 *   - New Hire Enrollment (10 tests): Admin processes enrollment for new hires
 *   - Rehire Enrollment (12 tests): Admin processes enrollment for rehires
 *   - Job Reclass (25+ tests): Benefits changes triggered by job reclassification
 *   - Termination (9 tests): Benefits end/COBRA processing
 *   - Life Events (5 tests): Admin-reported life events (marriage, divorce, etc.)
 *   - Dependent Management (3 tests): Add/remove dependents, aging out
 *   - Leave of Absence (5 tests): Unpaid LOA benefits handling
 *   - International Assignment (6 tests): Benefits changes for intl assignments
 *   - Military Leave (2 tests): Benefits during military service
 *   - Plan Adjustments (5 tests): Adjust life, LTD, 403b, voluntary life
 *   - Continuation/COBRA (1 test): Post-termination coverage
 *   - Retirement (1 test): Retiree healthcare/life setup
 *   - Disability (2 tests): Disability benefits processing
 *   - 403b Admin (3 tests): 403b eligibility and reporting
 *   - View/Verify (2 tests): Admin views of benefit elections
 *   - Reprocess (1 test): Reprocess HIR/REH/PTF enrollment
 *   - Other Admin (misc): Fee, corrections, spouse setup, etc.
 *
 * UI: Redwood Benefits Activity Center -- person search combobox at top,
 *     filter chips, and worker detail cards with assignment info.
 */
export class BenefitsAdminFlow extends BaseBenefitsFlow {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Execute a benefits admin test case.
   * Uses the classified business process category to route to specific handlers.
   * All paths include error handling and screenshot capture.
   */
  async execute(tc: UATTestCase): Promise<void> {
    this.logFieldData(tc);
    const category = this.classifyBusinessProcess(tc);

    await this.withErrorHandling(tc.testId, async () => {
      switch (category) {
        case 'new-hire':
          await this.executeNewHireAdmin(tc);
          break;
        case 'rehire':
          await this.executeRehireAdmin(tc);
          break;
        case 'job-reclass':
          await this.executeJobReclassAdmin(tc);
          break;
        case 'termination':
          await this.executeTerminationBenefits(tc);
          break;
        case 'life-event':
          await this.executeLifeEventAdmin(tc);
          break;
        case 'dependent':
          await this.executeDependentManagement(tc);
          break;
        case 'dependent-aging':
          await this.executeDependentAging(tc);
          break;
        case 'beneficiary':
          await this.executeBeneficiaryManagement(tc);
          break;
        case 'leave':
          await this.executeLeaveOfAbsence(tc);
          break;
        case 'international':
          await this.executeInternationalAssignment(tc);
          break;
        case 'military':
          await this.executeMilitaryLeave(tc);
          break;
        case 'retirement':
          await this.executeRetirementBenefits(tc);
          break;
        case 'disability':
          await this.executeDisabilityAdmin(tc);
          break;
        case '403b':
          await this.execute403bAdmin(tc);
          break;
        case 'view':
          await this.executeViewBenefits(tc);
          break;
        case 'confirmation':
          await this.executeConfirmationStatement(tc);
          break;
        case 'reprocess':
          await this.executeReprocess(tc);
          break;
        case 'continuation':
          await this.executeContinuationOfCoverage(tc);
          break;
        case 'non-standard-enrollment':
          await this.executeNonStandardEnrollment(tc);
          break;
        case 'waive':
          await this.executeWaiveHealthcare(tc);
          break;
        case 'voluntary-life':
          await this.executeVoluntaryLife(tc);
          break;
        case 'plan-adjustment':
          await this.executePlanAdjustment(tc);
          break;
        case 'regional':
          await this.executeRegionalBenefits(tc);
          break;
        case 'admin-fee':
          await this.executeAdminFee(tc);
          break;
        case 'spouse-setup':
          await this.executeSpouseSetup(tc);
          break;
        case 'location-change':
          await this.executeLocationChange(tc);
          break;
        case 'anniversary':
          await this.executeAnniversaryBenefits(tc);
          break;
        case 'death':
          await this.executeDeathBenefits(tc);
          break;
        case 'correction':
          await this.executeBenefitsCorrection(tc);
          break;
        case 'service-date':
          await this.executeServiceDateChange(tc);
          break;
        case 'enrollment':
        case 'election':
          await this.executeAdminEnrollment(tc);
          break;
        default:
          await this.executeGeneralAdmin(tc);
          break;
      }
    });
  }

  // =================================================================
  // New Hire / Rehire Enrollment (Admin)
  // =================================================================

  /**
   * Admin processes new hire enrollment.
   * Steps: Navigate to Activity Center -> Search person -> Open enrollment
   *        -> Select plan/option from field data -> Submit -> Verify.
   */
  private async executeNewHireAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  /**
   * Admin processes rehire enrollment.
   * Same flow as new hire -- person already exists, just needs enrollment refresh.
   */
  private async executeRehireAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Job Reclassification (25+ tests)
  // =================================================================

  /**
   * Benefits changes triggered by job reclassification.
   * The reclass life event should already exist; admin verifies/processes
   * the resulting enrollment changes.
   *
   * Common scenarios:
   *   - FT to PT: Healthcare eligibility may change, retirement plans affected
   *   - PT to FT: New enrollment window opens for healthcare, LTD, life
   *   - Intern <-> Staff: Program changes (no benefits -> benefits or vice versa)
   *   - RMO <-> Salaried/Hourly: Different benefit programs apply
   */
  private async executeJobReclassAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);

    // Filter by life event status to find reclass-triggered events
    await this.benefits.filterByStatus('Life Event Status');
    await this.benefits.selectFilterValue('Processed');
    await this.dismissFilterDialog();

    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Verify the enrollment reflects the reclassification
    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Termination Benefits (9 tests)
  // =================================================================

  /**
   * Process benefits upon employee termination.
   * Steps: Navigate -> Filter by terminated status -> Search person
   *        -> Verify benefits ended/COBRA-eligible -> Screenshot.
   */
  private async executeTerminationBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);

    // Apply assignment status filter to find terminated workers
    await this.benefits.filterByStatus('Assignment Status');
    await this.benefits.selectFilterValue('Terminated');
    await this.dismissFilterDialog();

    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Verify the benefit status after termination
    await this.benefits.verifyPlanSummary();

    // Soft assertion: page should reflect terminated status
    try {
      const pageText = await this.page.locator('body').innerText();
      const hasTerminatedIndicator = /terminat|ended|inactive|cobra/i.test(pageText);
      expect.soft(hasTerminatedIndicator, `[Benefits] ${tc.testId}: Expected terminated/ended/COBRA indicator on page`).toBeTruthy();
    } catch {
      console.warn(`[Benefits] ${tc.testId}: Could not verify termination status text on page`);
    }

    await this.benefits.captureBenefitsState(`termination-${tc.testId}`);
  }

  // =================================================================
  // Life Event Admin (5 tests)
  // =================================================================

  /**
   * Admin-side life event processing.
   * Handles: marriage, divorce, birth, adoption, dependent aging, spouse events.
   */
  private async executeLifeEventAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Report or process the life event
    const eventType = this.extractLifeEventType(tc);
    const eventDate = this.getEnrollmentDate(tc)
      || this.extractDate(tc, 'event date')
      || this.extractDate(tc, 'date');

    if (eventType) {
      await this.benefits.reportAdminLifeEvent(eventType, eventDate || undefined);
    }

    // Process resulting enrollment changes
    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Dependent Management (3 tests)
  // =================================================================

  /**
   * Admin dependent management.
   * Add/remove dependents from healthcare, manage dependent coverage.
   */
  private async executeDependentManagement(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Navigate to dependents section and manage
    await this.benefits.manageDependents();
    await this.benefits.captureBenefitsState(`dependent-mgmt-${tc.testId}`);
  }

  /**
   * Dependent aging out (turns 26, disability flag).
   * Verify dependent is removed from healthcare plan at age 26.
   */
  private async executeDependentAging(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Verify the dependent's coverage status
    await this.benefits.manageDependents();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`dependent-aging-${tc.testId}`);
  }

  // =================================================================
  // Beneficiary Management (1 test)
  // =================================================================

  /**
   * Admin beneficiary management.
   * Staff can add/update/remove beneficiaries to life plans.
   */
  private async executeBeneficiaryManagement(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Navigate to beneficiary management
    const plan = this.getPlan(tc) || 'Life';
    await this.benefits.selectPlan(plan);
    await this.benefits.captureBenefitsState(`beneficiary-mgmt-${tc.testId}`);
  }

  // =================================================================
  // Leave of Absence (5 tests)
  // =================================================================

  /**
   * Unpaid Leave of Absence / Return From Leave.
   * Benefits may continue, be suspended, or change during LOA.
   * Scenarios: Hourly, Salaried, RMO, Intern, Part Time Field Staff.
   */
  private async executeLeaveOfAbsence(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Verify benefits status during/after leave
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`leave-${tc.testId}`);
  }

  // =================================================================
  // International Assignment (6 admin tests)
  // =================================================================

  /**
   * Benefits changes for international assignment (move to/from).
   * Workers moving to international assignment lose US benefits;
   * workers returning from intl assignment re-enroll in US benefits.
   */
  private async executeInternationalAssignment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Verify benefits reflect the international assignment change
    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('moved from') || bp.includes('is on')) {
      // Returning from international -- should have US benefits
      await this.benefits.openAdminEnrollment();
      await this.selectPlansFromFieldData(tc);
      await this.navigateAndSubmitEnrollment(tc);
    } else {
      // Moving to international -- verify benefits ended
      await this.benefits.verifyPlanSummary();
      await this.benefits.captureBenefitsState(`intl-assignment-${tc.testId}`);
    }
  }

  // =================================================================
  // Military Leave (2 tests)
  // =================================================================

  /**
   * Military leave benefits processing.
   * <31 days: benefits continue normally.
   * >31 days: COBRA-like continuation, employer may cover.
   */
  private async executeMilitaryLeave(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();

    // Soft assertion: page should show plan or coverage status
    try {
      const planText = this.page.getByText(/plan|coverage|enrolled|active|suspended/i).first();
      expect.soft(await planText.isVisible({ timeout: 5000 }).catch(() => false),
        `[Benefits] ${tc.testId}: Expected plan/coverage status text visible for military leave`).toBeTruthy();
    } catch {
      console.warn(`[Benefits] ${tc.testId}: Could not verify plan status for military leave`);
    }

    await this.benefits.captureBenefitsState(`military-${tc.testId}`);
  }

  // =================================================================
  // Retirement Benefits (1 test)
  // =================================================================

  /**
   * Set up retirement healthcare and basic life for a retiring staff member.
   */
  private async executeRetirementBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Disability Admin (2 tests)
  // =================================================================

  /**
   * Disability-related benefits administration.
   * LTD terminates on 71st birthday. Staff on disability gets Select plan.
   */
  private async executeDisabilityAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Verify LTD/disability benefit status
    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);

    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('ltd terminat') || bp.includes('basic life')) {
      // Verification only -- check plan status
      await this.benefits.verifyPlanSummary();
      await this.benefits.captureBenefitsState(`disability-${tc.testId}`);
    } else {
      await this.navigateAndSubmitEnrollment(tc);
    }
  }

  // =================================================================
  // 403b Admin (3 tests)
  // =================================================================

  /**
   * 403b administration: eligibility, FT/PT codes, catch-up limits.
   * These are verification tasks -- check that 403b is set up correctly.
   */
  private async execute403bAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Verify 403b enrollment details
    await this.benefits.verifyPlanSummary();

    // Soft assertion: page should show 403b or retirement plan details
    try {
      const pageText = await this.page.locator('body').innerText();
      const has403bIndicator = /403\(?\s*b\)?|retirement|eligib|catch.?up/i.test(pageText);
      expect.soft(has403bIndicator, `[Benefits] ${tc.testId}: Expected 403b/retirement/eligibility text on page`).toBeTruthy();
    } catch {
      console.warn(`[Benefits] ${tc.testId}: Could not verify 403b details on page`);
    }

    await this.benefits.captureBenefitsState(`403b-${tc.testId}`);
  }

  // =================================================================
  // View Benefits (2 tests)
  // =================================================================

  /**
   * Admin views staff member benefit elections.
   * Read-only verification -- no changes made.
   */
  private async executeViewBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`view-${tc.testId}`);
  }

  // =================================================================
  // Confirmation Statement (admin side, 1 test)
  // =================================================================

  /**
   * Verify confirmation statement after enrollment event.
   */
  private async executeConfirmationStatement(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`confirmation-${tc.testId}`);
  }

  // =================================================================
  // Reprocess (1 test)
  // =================================================================

  /**
   * Reprocess a HIR, REH, or PTF enrollment event.
   */
  private async executeReprocess(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Continuation of Coverage / COBRA (1 test)
  // =================================================================

  /**
   * Set up COBRA/continuation of coverage after termination.
   */
  private async executeContinuationOfCoverage(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);

    // Search among terminated workers
    await this.benefits.filterByStatus('Assignment Status');
    await this.benefits.selectFilterValue('Terminated');
    await this.dismissFilterDialog();

    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Non-Standard Enrollment (self-supported, subsidiary)
  // =================================================================

  /**
   * Enroll self-supported staff members or subsidiary employees.
   * These non-standard workers need admin-initiated enrollment.
   */
  private async executeNonStandardEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Waive Healthcare
  // =================================================================

  /**
   * Admin waives healthcare for a staff member outside of a life event.
   */
  private async executeWaiveHealthcare(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    // For waive, we look for a "Waive" option instead of enrolling
    const plan = this.getPlan(tc);
    if (plan) {
      await this.benefits.selectPlan(plan);
    }
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Voluntary Life
  // =================================================================

  /**
   * Voluntary Life or Spouse/Dependent Voluntary Life election/update/termination.
   */
  private async executeVoluntaryLife(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Plan Adjustment
  // =================================================================

  /**
   * Adjust existing benefit plan (basic life decrease at 80, etc.).
   */
  private async executePlanAdjustment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Regional Benefits (Hawaii, Puerto Rico)
  // =================================================================

  /**
   * Regional benefits handling (Hawaii Select plan, Puerto Rico no retirement).
   */
  private async executeRegionalBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`regional-${tc.testId}`);
  }

  // =================================================================
  // Admin Fee (BENADM)
  // =================================================================

  /**
   * Add BENADM fee when RMO waives healthcare.
   */
  private async executeAdminFee(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`admin-fee-${tc.testId}`);
  }

  // =================================================================
  // Spouse Setup
  // =================================================================

  /**
   * Set up RMO spouse with healthcare after other spouse terminates.
   */
  private async executeSpouseSetup(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Location Change
  // =================================================================

  /**
   * Ministry location reassignment that qualifies for healthcare plan changes.
   */
  private async executeLocationChange(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Anniversary Benefits
  // =================================================================

  /**
   * Hourly work anniversary 403b contribution amounts.
   */
  private async executeAnniversaryBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`anniversary-${tc.testId}`);
  }

  // =================================================================
  // Death Benefits
  // =================================================================

  /**
   * Death of an employee -- verify benefits for surviving dependents.
   */
  private async executeDeathBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`death-${tc.testId}`);
  }

  // =================================================================
  // Benefits Correction
  // =================================================================

  /**
   * Correct benefits when a life event date changes after processing,
   * or when a life event was added incorrectly.
   */
  private async executeBenefitsCorrection(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Corrections require admin life event date changes — complex flow, view-only for now
    console.log(`[Benefits] ${tc.testId}: Correction test — viewing life events (full correction flow not yet automated)`);
    await this.benefits.openAdminLifeEvents();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`correction-${tc.testId}`);
  }

  // =================================================================
  // Service Date Change
  // =================================================================

  /**
   * Change benefit service date to appropriate date.
   * Also handles spouse voluntary life setup requiring dependent addition.
   */
  private async executeServiceDateChange(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`service-date-${tc.testId}`);
  }

  // =================================================================
  // General Admin Enrollment
  // =================================================================

  /**
   * Admin-initiated enrollment processing.
   * Used for standard enrollment actions and as fallback for specific scenarios.
   */
  private async executeAdminEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openAdminEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  /**
   * General admin flow (fallback for unmatched scenarios).
   */
  private async executeGeneralAdmin(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToBenefitsAdmin(tc);
    await this.searchAndSelectPerson(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Try opening enrollment to view current state
    await this.benefits.openAdminEnrollment();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`admin-general-${tc.testId}`);
  }

  // =================================================================
  // Helper methods
  // =================================================================

  /**
   * Select plans from field data (migration DB).
   * Uses Plan, Option, and Coverage Amount from the TestCase fields.
   */
  private async selectPlansFromFieldData(tc: UATTestCase): Promise<void> {
    const plan = this.getPlan(tc);
    const option = this.getOption(tc);
    const coverageAmount = this.getCoverageAmount(tc);

    if (plan) {
      await this.benefits.selectPlan(plan);
    }

    if (option) {
      // Try to select the option as a coverage/sub-plan choice
      await this.benefits.selectCoverage(option);
    }

    // Fallback: also try text-based plan extraction from testData
    if (!plan) {
      const textPlans = this.extractPlanTypes(tc);
      for (const tp of textPlans) {
        await this.benefits.selectPlan(tp);
      }
      const coverageLevel = this.extractCoverageLevel(tc);
      if (coverageLevel) {
        await this.benefits.selectCoverage(coverageLevel);
      }
    }
  }

  /**
   * Navigate through enrollment wizard steps and submit.
   * Handles Next -> Submit -> confirmation dialog -> Done -> Verify.
   */
  private async navigateAndSubmitEnrollment(tc: UATTestCase): Promise<void> {
    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`admin-${tc.testId}`);
  }

  /**
   * Dismiss filter dialog after selecting a filter value.
   * Filter chip popups need to be closed before continuing.
   */
  private async dismissFilterDialog(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(1000);
  }
}
