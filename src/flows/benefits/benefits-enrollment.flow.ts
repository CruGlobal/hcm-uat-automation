import { type Page } from '@playwright/test';
import { BaseBenefitsFlow } from './base-benefits.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Benefits Enrollment / Elections (Employee Self-Service)
 * Module: Benefits
 * Covers 49 employee self-service test cases across all ESS scenarios:
 *
 *   - New Hire Enrollment (10 tests): New hire selects benefits
 *   - Rehire Enrollment (3 tests): Rehired employee re-enrolls
 *   - Life Event Enrollment (4 tests): Marriage, birth, adoption, divorce
 *   - Open Enrollment (varies): Annual plan selection
 *   - Dependent Management (2 tests): Add/manage dependents via ESS
 *   - Beneficiary Management (1 test): Beneficiary designation
 *   - View Benefits (2 tests): Staff views their benefits summary
 *   - Flex Benefits (3 tests): Hourly flex benefit elections
 *   - Confirmation Statement (1 test): Post-enrollment confirmation
 *   - Regional (1 test): Hawaii Select plan
 *   - International Assignment (2 tests): ESS intl assignment handling
 *
 * UI: Redwood Benefits ESS -- enrollment summary with plan cards,
 *      "Show Benefits" dropdown, "Enroll Now" button, quick-action sidebar.
 */
export class BenefitsEnrollmentFlow extends BaseBenefitsFlow {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Execute a benefits enrollment test case.
   * Uses the classified business process category to route to specific handlers.
   * All paths include error handling and screenshot capture.
   */
  async execute(tc: UATTestCase): Promise<void> {
    this.logFieldData(tc);
    const category = this.classifyBusinessProcess(tc);

    await this.withErrorHandling(tc.testId, async () => {
      switch (category) {
        case 'new-hire':
          await this.executeNewHireEnrollment(tc);
          break;
        case 'rehire':
          await this.executeRehireEnrollment(tc);
          break;
        case 'life-event':
          await this.executeLifeEventEnrollment(tc);
          break;
        case 'enrollment':
        case 'election':
          await this.executeOpenEnrollment(tc);
          break;
        case 'dependent':
        case 'dependent-aging':
          await this.executeDependentEnrollment(tc);
          break;
        case 'beneficiary':
          await this.executeBeneficiaryEnrollment(tc);
          break;
        case 'view':
          await this.executeViewBenefits(tc);
          break;
        case 'confirmation':
          await this.executeConfirmationStatement(tc);
          break;
        case 'flex':
          await this.executeFlexBenefits(tc);
          break;
        case 'regional':
          await this.executeRegionalEnrollment(tc);
          break;
        case 'international':
          await this.executeInternationalESS(tc);
          break;
        case 'waive':
          await this.executeWaiveHealthcareESS(tc);
          break;
        case 'job-reclass':
          await this.executeReclassEnrollment(tc);
          break;
        case 'leave':
          await this.executeLeaveESS(tc);
          break;
        case 'spouse-setup':
          await this.executeSpouseEnrollment(tc);
          break;
        default:
          await this.executeGeneralEnrollment(tc);
          break;
      }
    });
  }

  // =================================================================
  // New Hire Enrollment
  // =================================================================

  /**
   * New hire benefits enrollment flow.
   * Steps:
   * 1. Navigate to ESS Benefits enrollment summary
   * 2. Click "Enroll Now" to open the enrollment wizard
   * 3. Select plan from field data (Plan, Option, Coverage Amount)
   * 4. Handle dependents/beneficiaries if referenced
   * 5. Navigate through wizard and submit
   * 6. Verify confirmation
   */
  private async executeNewHireEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Open enrollment wizard
    await this.benefits.openEnrollment();

    // Select plans from field data
    await this.selectPlansFromFieldData(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Rehire Enrollment
  // =================================================================

  /**
   * Rehire benefits enrollment.
   * Same flow as new hire -- ESS enrollment after rehire event.
   * Includes within-1-year rehire scenarios (no waiting period).
   */
  private async executeRehireEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Check for pending enrollment from rehire event
    await this.benefits.setShowBenefitsFilter('Pending enrollment');
    await this.benefits.openEnrollment();

    await this.selectPlansFromFieldData(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Life Event Enrollment (4 tests)
  // =================================================================

  /**
   * Life event triggered enrollment flow.
   * Handles: marriage, birth, adoption, divorce.
   * Steps: Navigate -> Report life event -> Open enrollment
   *        -> Select plans -> Submit -> Verify.
   */
  private async executeLifeEventEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // If an "Enroll Now" / "Make Changes" button is already visible, a life
    // event is already pending — skip the Report step (otherwise we'd try to
    // file a duplicate event on top of the existing one). This handles tests
    // run after a manually-pre-staged life event.
    const enrollNowVisible = await this.page
      .getByRole('button', { name: /enroll now|make changes/i }).first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    if (!enrollNowVisible) {
      const eventType = this.extractLifeEventType(tc);
      const eventDate = this.getEnrollmentDate(tc)
        || this.extractDate(tc, 'event date')
        || this.extractDate(tc, 'date');
      if (eventType) {
        await this.benefits.reportLifeEvent(eventType, eventDate || undefined);
      }
    } else {
      console.log(`[Benefits] ${tc.testId}: Pending enrollment already exists — skipping life event report`);
    }

    // Open enrollment, fill plans / dependents / beneficiaries, submit
    await this.benefits.openEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Open Enrollment
  // =================================================================

  /**
   * Open enrollment period flow.
   * Shows "Pending enrollment" filter to see available events.
   */
  private async executeOpenEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.setShowBenefitsFilter('Pending enrollment');
    await this.benefits.openEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Dependent Enrollment
  // =================================================================

  /**
   * Dependent-focused enrollment flow.
   * Navigate to dependents, manage them, verify enrollment reflects changes.
   */
  private async executeDependentEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.handleDependents(tc);

    // Verify the enrollment summary reflects dependent changes
    await this.benefits.viewEnrollmentSummary();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`dependent-ess-${tc.testId}`);
  }

  // =================================================================
  // Beneficiary Enrollment
  // =================================================================

  /**
   * Beneficiary-focused enrollment flow.
   * Staff adds/updates beneficiaries on life plans.
   */
  private async executeBeneficiaryEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openEnrollment();
    await this.handleBeneficiaries(tc);

    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`beneficiary-ess-${tc.testId}`);
  }

  // =================================================================
  // View Benefits (2 ESS tests)
  // =================================================================

  /**
   * Staff views their benefits summary (read-only).
   * Verifies the enrollment summary page loads and shows plan cards.
   */
  private async executeViewBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.viewEnrollmentSummary();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`view-ess-${tc.testId}`);
  }

  // =================================================================
  // Confirmation Statement (1 ESS test)
  // =================================================================

  /**
   * Verify confirmation statement after enrollment event.
   */
  private async executeConfirmationStatement(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.viewEnrollmentSummary();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`confirmation-ess-${tc.testId}`);
  }

  // =================================================================
  // Flex Benefits (3 ESS tests)
  // =================================================================

  /**
   * Hourly flex benefit elections.
   * After 2 years of service, hourly staff can elect flex credits.
   * 5/10/15 year anniversaries allow election between medical and retirement.
   */
  private async executeFlexBenefits(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Look for pending enrollment with flex benefit options
    await this.benefits.setShowBenefitsFilter('Pending enrollment');
    await this.benefits.openEnrollment();

    // Select flex plan from field data
    await this.selectPlansFromFieldData(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Regional Enrollment (Hawaii)
  // =================================================================

  /**
   * Regional benefits enrollment (Hawaii Select plan).
   * Hawaii staff default to Select Healthcare plan.
   */
  private async executeRegionalEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // International Assignment (2 ESS tests)
  // =================================================================

  /**
   * ESS benefits handling during international assignment.
   */
  private async executeInternationalESS(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.viewEnrollmentSummary();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`intl-ess-${tc.testId}`);
  }

  // =================================================================
  // Waive Healthcare (ESS)
  // =================================================================

  /**
   * Staff member waives healthcare through ESS.
   */
  private async executeWaiveHealthcareESS(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openEnrollment();
    // Select waive option for healthcare plan
    const plan = this.getPlan(tc) || 'Healthcare';
    await this.benefits.selectPlan(plan);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Job Reclass Enrollment
  // =================================================================

  /**
   * ESS enrollment changes triggered by job reclassification.
   */
  private async executeReclassEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    // Check for pending enrollment from reclass event
    await this.benefits.setShowBenefitsFilter('Pending enrollment');
    await this.benefits.openEnrollment();
    await this.selectPlansFromFieldData(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Leave of Absence (ESS)
  // =================================================================

  /**
   * ESS benefits view during/after unpaid leave of absence.
   */
  private async executeLeaveESS(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.viewEnrollmentSummary();
    await this.benefits.verifyPlanSummary();
    await this.benefits.captureBenefitsState(`leave-ess-${tc.testId}`);
  }

  // =================================================================
  // Spouse Enrollment
  // =================================================================

  /**
   * RMO spouse enrollment scenarios through ESS.
   */
  private async executeSpouseEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.openEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.handleDependents(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // General Enrollment (fallback)
  // =================================================================

  /**
   * General enrollment flow (fallback for unmatched scenarios).
   */
  private async executeGeneralEnrollment(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigateToSelfService(tc);

    if (await this.checkNoBenefitsRelationship(tc.testId)) return;

    await this.benefits.viewEnrollmentSummary();
    await this.benefits.openEnrollment();
    await this.selectPlansFromFieldData(tc);
    await this.handleDependents(tc);
    await this.handleBeneficiaries(tc);

    await this.navigateAndSubmitEnrollment(tc);
  }

  // =================================================================
  // Helper methods
  // =================================================================

  /**
   * Select plans from field data (migration DB).
   * Uses Plan, Option, and Coverage Amount from the TestCase fields.
   * Falls back to text-based extraction from UATTestCase metadata.
   */
  private async selectPlansFromFieldData(tc: UATTestCase): Promise<void> {
    const plan = this.getPlan(tc);
    const option = this.getOption(tc);

    if (plan) {
      await this.benefits.selectPlan(plan);
    }

    if (option) {
      await this.benefits.selectCoverage(option);
    }

    // Fallback: text-based extraction from testData/testScenario
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
   */
  private async navigateAndSubmitEnrollment(tc: UATTestCase): Promise<void> {
    await this.benefits.clickEnrollmentNext();
    await this.benefits.submitEnrollment();
    await this.benefits.clickDone();
    await this.benefits.verifyEnrollmentConfirmation();
    await this.benefits.captureBenefitsState(`ess-${tc.testId}`);
  }

  /**
   * Handle dependent additions if referenced in the test data or field data.
   */
  private async handleDependents(tc: UATTestCase): Promise<void> {
    const bp = (tc.businessProcess || '').toLowerCase();
    const sc = (tc.testScenario || '').toLowerCase();
    const data = `${tc.testData} ${sc} ${bp}`;

    if (!data.toLowerCase().includes('dependent')) return;

    const depMatch = tc.testData.match(/dependent\s*[:\-]?\s*([^,;\n]+)/i);
    const relMatch = tc.testData.match(/relationship\s*[:\-]?\s*([^,;\n]+)/i);

    if (depMatch) {
      const name = depMatch[1].trim();
      const relationship = relMatch ? relMatch[1].trim() : 'Spouse';
      await this.benefits.addDependent(name, relationship);
    } else {
      // Navigate to dependents page for verification
      await this.benefits.manageDependents();
    }
  }

  /**
   * Handle beneficiary additions if referenced in the test data or field data.
   */
  private async handleBeneficiaries(tc: UATTestCase): Promise<void> {
    const bp = (tc.businessProcess || '').toLowerCase();
    const sc = (tc.testScenario || '').toLowerCase();
    const data = `${tc.testData} ${sc} ${bp}`;

    if (!data.toLowerCase().includes('beneficiar')) return;

    const benMatch = tc.testData.match(/beneficiary\s*[:\-]?\s*([^,;\n]+)/i);
    const pctMatch = tc.testData.match(/(?:percentage|allocation|%)\s*[:\-]?\s*(\d+)/i);

    if (benMatch) {
      const name = benMatch[1].trim();
      const percentage = pctMatch ? pctMatch[1] : '100';
      await this.benefits.addBeneficiary(name, percentage);
    }
  }
}
