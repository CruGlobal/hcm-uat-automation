import { type Page } from '@playwright/test';
import { BaseJourneysFlow } from './base-journeys.flow';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow: Journey Assignment and Task Management
 * Module: Journeys (66 tests, all with field data)
 *
 * Field data structure (from migration DB):
 *   Person Name:       "Smith, Paul" (Last, First format)
 *   Person Number:     "10000002"
 *   Journey Template:  "Supported Onboarding - Journey Assignment"
 *   Effective Date:    "46080" (Excel serial) or "2024/01/01"
 *   Person Type:       "Employee - Staff"
 *   Department:        "Conversion Department"
 *   Job:               "CNV_JOB"
 *   Legal Employer:    "Campus Crusade for Christ, Inc."
 *
 * Routes based on journey type derived from businessProcess field:
 * - Onboarding (supported, hourly, salaried, intern)
 * - Offboarding
 * - Life events (medical leave, marriage, SOSA, etc.)
 * - Access requests (Oracle access, background checks)
 * - Transitions (status changes, transfers)
 * - Task management (viewing/completing tasks, progress tracking)
 * - Administrative (mass assignment, template sync, error handling)
 *
 * Uses real Redwood/JET selectors from journeys-admin-deep.json.
 */
export class JourneyAssignmentFlow extends BaseJourneysFlow {
  constructor(page: Page) {
    super(page);
  }

  /** Execute the journey assignment flow for a UAT test case. */
  async execute(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigate(tc);

    const fieldData = getFieldData(tc.testId);
    const journeyType = this.resolveJourneyType(tc);

    console.log(`[Journeys] ${tc.testId}: type=${journeyType}, bp="${tc.businessProcess.substring(0, 50)}"`);
    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      const template = getField(fieldData, 'Journey Template');
      console.log(`[Journeys] Field data: person="${personName}", template="${template}"`);
    }

    switch (journeyType) {
      case 'onboarding':
        await this.executeOnboarding(tc, fieldData);
        break;
      case 'offboarding':
        await this.executeOffboarding(tc, fieldData);
        break;
      case 'life-event':
        await this.executeLifeEvent(tc, fieldData);
        break;
      case 'access-request':
        await this.executeAccessRequest(tc, fieldData);
        break;
      case 'task-completion':
        await this.executeTaskCompletion(tc, fieldData);
        break;
      case 'view-journeys':
        await this.executeViewJourneys(tc, fieldData);
        break;
      case 'view-tasks':
        await this.executeViewTasks(tc, fieldData);
        break;
      case 'transition':
        await this.executeTransition(tc, fieldData);
        break;
      case 'admin':
        await this.executeAdminJourney(tc, fieldData);
        break;
      default:
        await this.executeGenericJourney(tc, fieldData);
        break;
    }
  }

  /**
   * Resolve the journey type from the test case's businessProcess and testScenario fields.
   * Returns a normalized journey type string.
   */
  private resolveJourneyType(tc: UATTestCase): string {
    const bp = (tc.businessProcess + ' ' + tc.testScenario).toLowerCase();

    // Onboarding variations
    if (bp.includes('onboarding') || bp.includes('onboard') || bp.includes('new hire') ||
        bp.includes('volunteer') || bp.includes('affiliate')) {
      return 'onboarding';
    }
    // Offboarding
    if (bp.includes('offboarding') || bp.includes('offboard') || bp.includes('termination journey')) {
      return 'offboarding';
    }
    // Life events
    if (
      bp.includes('life event') || bp.includes('medical leave') ||
      bp.includes('marriage') || bp.includes('sosa') ||
      bp.includes('leave of absence') || bp.includes('parental') ||
      bp.includes('leave journey') || bp.includes('ada accommodation') ||
      bp.includes('sabbatical') || bp.includes('address change')
    ) {
      return 'life-event';
    }
    // Access requests
    if (bp.includes('access request') || bp.includes('provisioning') ||
        bp.includes('oracle access') || bp.includes('background check') ||
        bp.includes('credit card policy')) {
      return 'access-request';
    }
    // Task completion / progress tracking
    if (bp.includes('task completion') || bp.includes('complete task') ||
        bp.includes('checklist') || bp.includes('progress tracking') ||
        bp.includes('task types') || bp.includes('due dates')) {
      return 'task-completion';
    }
    // Transitions
    if (bp.includes('transition') || bp.includes('intern to rmo') ||
        bp.includes('international') || bp.includes('us to int') ||
        bp.includes('back to us') || bp.includes('status to status') ||
        bp.includes('internal hiring')) {
      return 'transition';
    }
    // Administrative / system operations
    if (bp.includes('mass assignment') || bp.includes('template change') ||
        bp.includes('synchronize') || bp.includes('error handling') ||
        bp.includes('troubleshoot') || bp.includes('cancellation') ||
        bp.includes('closure') || bp.includes('retro hire') ||
        bp.includes('late start') || bp.includes('eligibility') ||
        bp.includes('security') || bp.includes('negative') ||
        bp.includes('document record') || bp.includes('attachment') ||
        bp.includes('contextual') || bp.includes('manager view') ||
        bp.includes('reassignment') || bp.includes('multiple concurrent') ||
        bp.includes('annual agreement') || bp.includes('annual vows') ||
        bp.includes('reminder') || bp.includes('non-completion') ||
        bp.includes('1st') || bp.includes('90th day')) {
      return 'admin';
    }
    // View journeys
    if (bp.includes('view journey') || bp.includes('my journeys')) {
      return 'view-journeys';
    }
    // View tasks
    if (bp.includes('view task') || bp.includes('my tasks')) {
      return 'view-tasks';
    }

    return 'generic';
  }

  /**
   * Fill journey assignment fields from migration DB field data.
   * Uses getField() for case-insensitive partial key matching.
   */
  private async fillFromFieldData(fieldData: TestCase | undefined): Promise<void> {
    if (!fieldData) return;

    // Person lookup — field data has "Person Name" in "Last, First" format
    const personName = getField(fieldData, 'Person Name');
    const personNumber = getField(fieldData, 'Person Number');

    if (personName) {
      console.log(`[Journeys] Searching for person: ${personName}`);
      await this.journeysPage.searchPerson(personName);
    }

    // Journey template selection
    const template = getField(fieldData, 'Journey Template');
    if (template) {
      console.log(`[Journeys] Selecting template: ${template}`);
      await this.journeysPage.selectJourneyTemplate(template);
    }

    // Effective date
    const effectiveDate = getField(fieldData, 'Effective Date');
    if (effectiveDate) {
      const dateStr = excelSerialToDate(effectiveDate);
      console.log(`[Journeys] Effective date: ${effectiveDate} -> ${dateStr}`);
      await this.journeysPage.fillEffectiveDate(dateStr);
    }
  }

  /** Execute an onboarding journey assignment. */
  private async executeOnboarding(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.fillFromFieldData(fieldData);
    // Fall back to parsing testData if no field data
    if (!fieldData) {
      await this.journeysPage.fillFromTestCase(tc);
    }
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-onboarding-${tc.testId}`);
  }

  /** Execute an offboarding journey assignment. */
  private async executeOffboarding(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.fillFromFieldData(fieldData);
    if (!fieldData) {
      await this.journeysPage.fillFromTestCase(tc);
    }
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-offboarding-${tc.testId}`);
  }

  /** Execute a life event journey assignment. */
  private async executeLifeEvent(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.fillFromFieldData(fieldData);
    if (!fieldData) {
      await this.journeysPage.fillFromTestCase(tc);
    }
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-life-event-${tc.testId}`);
  }

  /** Execute an access request journey assignment. */
  private async executeAccessRequest(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.fillFromFieldData(fieldData);
    if (!fieldData) {
      await this.journeysPage.fillFromTestCase(tc);
    }
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-access-request-${tc.testId}`);
  }

  /** Execute task completion within a journey. */
  private async executeTaskCompletion(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    // For task completion/progress tracking, go to Organization Journeys and search
    await this.journeysPage.selectTab('Organization Journeys');

    // Search for the person from field data
    if (fieldData) {
      const personName = getField(fieldData, 'Person Name');
      if (personName) {
        await this.journeysPage.searchPerson(personName);
      }
    } else {
      const personRef = this.extractPersonFromTestData(tc);
      if (personRef) {
        await this.journeysPage.searchPerson(personRef);
      }
    }

    // Click the first journey result to view tasks
    await this.journeysPage.clickFirstJourneyResult();

    // Complete the first available task
    await this.journeysPage.completeTaskByIndex(0);
    await this.journeysPage.clickCompleteTask();
    await this.journeysPage.screenshot(`journey-task-complete-${tc.testId}`);
  }

  /** Execute a transition journey (intern to RMO, international, etc.). */
  private async executeTransition(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.fillFromFieldData(fieldData);
    if (!fieldData) {
      await this.journeysPage.fillFromTestCase(tc);
    }
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-transition-${tc.testId}`);
  }

  /** Execute an administrative journey operation. */
  private async executeAdminJourney(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const bp = tc.businessProcess.toLowerCase();

    if (bp.includes('mass assignment') || bp.includes('launchpad')) {
      // Mass assignment — navigate to Explore tab
      await this.journeysPage.selectTab('Explore');
      await this.journeysPage.screenshot(`journey-mass-${tc.testId}`);
    } else if (bp.includes('cancellation') || bp.includes('closure')) {
      // Journey cancellation — search for person, then cancel
      await this.journeysPage.selectTab('Organization Journeys');
      if (fieldData) {
        const personName = getField(fieldData, 'Person Name');
        if (personName) await this.journeysPage.searchPerson(personName);
      }
      await this.journeysPage.clickFirstJourneyResult();
      await this.journeysPage.screenshot(`journey-cancel-${tc.testId}`);
    } else if (bp.includes('manager view') || bp.includes('reassignment')) {
      // Manager view / reassignment
      await this.journeysPage.selectTab('Organization Journeys');
      if (fieldData) {
        const personName = getField(fieldData, 'Person Name');
        if (personName) await this.journeysPage.searchPerson(personName);
      }
      await this.journeysPage.screenshot(`journey-manager-${tc.testId}`);
    } else if (bp.includes('synchronize') || bp.includes('template')) {
      // Template synchronization — admin operation
      await this.journeysPage.selectTab('Explore');
      await this.journeysPage.screenshot(`journey-sync-${tc.testId}`);
    } else {
      // Generic admin operation — assign and track
      await this.journeysPage.selectTab('Organization Journeys');
      if (fieldData) {
        const personName = getField(fieldData, 'Person Name');
        if (personName) await this.journeysPage.searchPerson(personName);
      }
      await this.journeysPage.clickFirstJourneyResult();
      await this.journeysPage.screenshot(`journey-admin-${tc.testId}`);
    }
  }

  /** View journeys list (My Journeys tab). */
  private async executeViewJourneys(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.viewMyJourneys();

    // Apply filters if test case specifies status or category
    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('active')) {
      await this.journeysPage.filterByStatus('Active');
    } else if (bp.includes('completed')) {
      await this.journeysPage.filterByStatus('Completed');
    }

    await this.journeysPage.screenshot(`journey-view-${tc.testId}`);
  }

  /** View tasks list (My Tasks tab). */
  private async executeViewTasks(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.viewMyTasks();
    await this.journeysPage.screenshot(`journey-tasks-${tc.testId}`);
  }

  /** Execute a generic journey assignment (fallback for unrecognized types). */
  private async executeGenericJourney(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.fillFromFieldData(fieldData);
    if (!fieldData) {
      await this.journeysPage.fillFromTestCase(tc);
    }
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-generic-${tc.testId}`);
  }

  /** Extract person name/number from test case data fields. */
  private extractPersonFromTestData(tc: UATTestCase): string | null {
    const sources = [tc.testData, tc.preConditions];
    for (const src of sources) {
      if (!src) continue;
      const match = src.match(
        /(?:employee|person|worker|name|number)[:\s]*([^\n,;]+)/i
      );
      if (match) return match[1].trim();
    }
    return null;
  }
}
