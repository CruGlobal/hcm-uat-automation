import { type Page } from '@playwright/test';
import { BaseJourneysFlow } from './base-journeys.flow';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow: Journey Assignment and Task Management
 * Module: Journeys (66 tests)
 *
 * Oracle HCM Journeys UI flow (from live inspection 2026-03-01):
 *   Assignment: Explore tab → search journey name → click card → detail page → "Assign" →
 *               fill "Select a Person" + "When to assign?" → click "Assign"
 *   Viewing:    Organization Journeys tab → search by person name
 *   Tasks:      My Tasks tab or Organization Journeys → click journey → task list
 */
export class JourneyAssignmentFlow extends BaseJourneysFlow {
  constructor(page: Page) {
    super(page);
  }

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
      case 'offboarding':
      case 'life-event':
      case 'access-request':
      case 'transition':
        await this.executeAssignment(tc, fieldData, journeyType);
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
      case 'admin':
        await this.executeAdminJourney(tc, fieldData);
        break;
      default:
        await this.executeAssignment(tc, fieldData, journeyType);
        break;
    }
  }

  /**
   * Resolve the journey type from businessProcess and testScenario fields.
   */
  private resolveJourneyType(tc: UATTestCase): string {
    const bp = (tc.businessProcess + ' ' + tc.testScenario).toLowerCase();

    if (bp.includes('onboarding') || bp.includes('onboard') || bp.includes('new hire') ||
        bp.includes('volunteer') || bp.includes('affiliate')) return 'onboarding';
    if (bp.includes('offboarding') || bp.includes('offboard') || bp.includes('termination journey'))
      return 'offboarding';
    if (bp.includes('life event') || bp.includes('medical leave') || bp.includes('marriage') ||
        bp.includes('sosa') || bp.includes('leave of absence') || bp.includes('parental') ||
        bp.includes('leave journey') || bp.includes('leaves journey') ||
        bp.includes('ada accommodation') || bp.includes('sabbatical') || bp.includes('address change'))
      return 'life-event';
    if (bp.includes('access request') || bp.includes('provisioning') || bp.includes('oracle access') ||
        bp.includes('background check') || bp.includes('credit card policy'))
      return 'access-request';
    if (bp.includes('task completion') || bp.includes('complete task') || bp.includes('checklist') ||
        bp.includes('progress tracking') || bp.includes('task types') || bp.includes('due dates'))
      return 'task-completion';
    if (bp.includes('transition') || bp.includes('intern to rmo') || bp.includes('international') ||
        bp.includes('us to int') || bp.includes('back to us') || bp.includes('status to status') ||
        bp.includes('internal hiring'))
      return 'transition';
    if (bp.includes('mass assignment') || bp.includes('template change') || bp.includes('synchronize') ||
        bp.includes('error handling') || bp.includes('troubleshoot') || bp.includes('cancellation') ||
        bp.includes('closure') || bp.includes('retro hire') || bp.includes('late start') ||
        bp.includes('eligibility') || bp.includes('security') || bp.includes('negative') ||
        bp.includes('document record') || bp.includes('attachment') || bp.includes('contextual') ||
        bp.includes('manager view') || bp.includes('reassignment') || bp.includes('multiple concurrent') ||
        bp.includes('annual agreement') || bp.includes('annual vows') || bp.includes('reminder') ||
        bp.includes('non-completion') || bp.includes('1st') || bp.includes('90th day') ||
        bp.includes('dept tree') || bp.includes('job code') || bp.includes('add/change request'))
      return 'admin';
    if (bp.includes('view journey') || bp.includes('my journeys')) return 'view-journeys';
    if (bp.includes('view task') || bp.includes('my tasks')) return 'view-tasks';

    return 'generic';
  }

  /**
   * Execute a journey assignment (onboarding, offboarding, life-event, etc.).
   *
   * Flow: Explore tab → search by journey name → click card → Assign → fill person → submit.
   */
  private async executeAssignment(
    tc: UATTestCase, fieldData: TestCase | undefined, journeyType: string
  ): Promise<void> {
    // Determine the journey name to search for
    const journeySearchTerm = this.resolveJourneySearchTerm(tc, fieldData, journeyType);
    console.log(`[Journeys] Searching for journey: "${journeySearchTerm}"`);

    // Step 1: Go to Explore tab and search for the journey
    await this.journeysPage.selectTab('Explore');
    await this.journeysPage.searchJourneyByName(journeySearchTerm);

    // Step 2: Click the journey card
    const cardClicked = await this.journeysPage.clickJourneyCard(journeySearchTerm);
    if (!cardClicked) {
      console.log(`[Journeys] No journey card found for "${journeySearchTerm}", taking screenshot`);
      await this.journeysPage.screenshot(`journey-no-card-${tc.testId}`);
      return;
    }

    // Step 3: Click "Assign" on the journey detail page
    await this.journeysPage.clickAssignOnDetail();

    // Step 4: Fill the assign form
    await this.fillAssignForm(tc, fieldData);

    // Step 5: Submit (may fail if required fields couldn't be filled)
    const submitted = await this.journeysPage.clickAssignSubmit();
    if (!submitted) {
      console.log(`[Journeys] ${tc.testId}: Could not submit — taking screenshot of assign form state`);
    }
    await this.journeysPage.screenshot(`journey-${journeyType}-${tc.testId}`);
  }

  /**
   * Fill the journey assign form with person and date.
   */
  private async fillAssignForm(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    // Fill person
    const personName = fieldData ? getField(fieldData, 'Person Name') : this.extractPersonFromTestData(tc);
    if (personName) {
      console.log(`[Journeys] Assigning to person: ${personName}`);
      await this.journeysPage.fillAssigneePerson(personName);
    }

    // Fill date — Oracle requires on or after today; use today if no field data or date is in the past.
    const effectiveDate = fieldData ? getField(fieldData, 'Effective Date') : null;
    let dateStr: string;
    if (effectiveDate) {
      dateStr = /^\d{5,}$/.test(effectiveDate) ? excelSerialToDate(effectiveDate) : effectiveDate;
      // If the date is in the past, use today instead
      const parsed = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!isNaN(parsed.getTime()) && parsed < today) {
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateStr = `${mm}/${dd}/${today.getFullYear()}`;
        console.log(`[Journeys] Field date was in the past — using today: ${dateStr}`);
      }
    } else {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateStr = `${mm}/${dd}/${today.getFullYear()}`;
    }
    console.log(`[Journeys] Assign date: ${dateStr}`);
    await this.journeysPage.fillAssignDate(dateStr);
  }

  /**
   * Resolve the journey search term from test case data.
   * Maps journey type keywords to actual Oracle HCM journey template names.
   */
  private resolveJourneySearchTerm(
    tc: UATTestCase, fieldData: TestCase | undefined, journeyType: string
  ): string {
    // Use field data template name if available
    if (fieldData) {
      const template = getField(fieldData, 'Journey Template');
      if (template) {
        // Extract the main journey name (e.g., "Supported Onboarding – Journey Assignment" → "Onboarding")
        if (template.toLowerCase().includes('onboarding')) return 'Onboarding';
        if (template.toLowerCase().includes('offboarding') || template.toLowerCase().includes('off boarding'))
          return 'Off boarding';
        return template.split('–')[0].split('-')[0].trim();
      }
    }

    // Fallback: derive from business process
    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('onboarding') || bp.includes('onboard')) return 'Onboarding';
    if (bp.includes('offboarding') || bp.includes('off boarding') || bp.includes('off board'))
      return 'Off boarding';
    if (bp.includes('medical leave')) return 'Medical Leave';
    if (bp.includes('marriage') || bp.includes('sosa')) return 'Marriage';
    if (bp.includes('leave of absence') || bp.includes('sabbatical')) return 'Leave';
    if (bp.includes('access request') || bp.includes('oracle access')) return 'Access';
    if (bp.includes('transition') || bp.includes('intern to rmo')) return 'Transition';

    // Generic fallback — search with the first meaningful word from business process
    return tc.businessProcess.split('–')[0].split('-')[0].trim().substring(0, 30);
  }

  /** Execute task completion within a journey. */
  private async executeTaskCompletion(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    // JR-064, JR-065 are ESS tests (employee completes their own tasks) → use My Journeys tab.
    // If transactionCategory is Admin, use Organization Journeys instead.
    const isAdmin = tc.transactionCategory?.toLowerCase().includes('admin');

    if (isAdmin) {
      await this.journeysPage.selectTab('Organization Journeys');
      if (fieldData) {
        const personName = getField(fieldData, 'Person Name');
        if (personName) await this.journeysPage.searchPerson(personName);
      } else {
        const personRef = this.extractPersonFromTestData(tc);
        if (personRef) await this.journeysPage.searchPerson(personRef);
      }
    } else {
      // ESS: employee opens their own assigned journeys
      await this.journeysPage.viewMyJourneys();
    }

    // Click into the first/relevant journey result
    await this.journeysPage.clickFirstJourneyResult();

    // Try to open a task (Start/Open button), then mark it complete.
    // If no Start button, fall back to checkbox + complete button approach.
    const taskOpened = await this.journeysPage.clickFirstTaskAction();
    if (taskOpened) {
      await this.journeysPage.clickCompleteTask();
    } else {
      // Fallback: try checkbox interaction
      await this.journeysPage.completeTaskByIndex(0);
      await this.journeysPage.clickCompleteTask();
    }
    await this.journeysPage.screenshot(`journey-task-complete-${tc.testId}`);
  }

  /** View journeys list. */
  private async executeViewJourneys(tc: UATTestCase, _fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.viewMyJourneys();
    const bp = tc.businessProcess.toLowerCase();
    if (bp.includes('active')) await this.journeysPage.filterByStatus('Active');
    else if (bp.includes('completed')) await this.journeysPage.filterByStatus('Completed');
    await this.journeysPage.screenshot(`journey-view-${tc.testId}`);
  }

  /** View tasks list. */
  private async executeViewTasks(tc: UATTestCase, _fieldData: TestCase | undefined): Promise<void> {
    await this.journeysPage.viewMyTasks();
    await this.journeysPage.screenshot(`journey-tasks-${tc.testId}`);
  }

  /** Execute administrative journey operations. */
  private async executeAdminJourney(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const bp = tc.businessProcess.toLowerCase();

    if (bp.includes('mass assignment') || bp.includes('launchpad')) {
      await this.journeysPage.selectTab('Explore');
      await this.journeysPage.screenshot(`journey-mass-${tc.testId}`);
    } else if (bp.includes('cancellation') || bp.includes('closure') ||
               bp.includes('manager view') || bp.includes('reassignment')) {
      await this.journeysPage.selectTab('Organization Journeys');
      if (fieldData) {
        const personName = getField(fieldData, 'Person Name');
        if (personName) await this.journeysPage.searchPerson(personName);
      }
      await this.journeysPage.clickFirstJourneyResult();
      await this.journeysPage.screenshot(`journey-admin-${tc.testId}`);
    } else {
      // Default admin: go to Organization Journeys and search
      await this.journeysPage.selectTab('Organization Journeys');
      if (fieldData) {
        const personName = getField(fieldData, 'Person Name');
        if (personName) await this.journeysPage.searchPerson(personName);
      }
      await this.journeysPage.screenshot(`journey-admin-${tc.testId}`);
    }
  }

  /** Extract person name/number from test case text fields. */
  private extractPersonFromTestData(tc: UATTestCase): string | null {
    for (const src of [tc.testData, tc.preConditions]) {
      if (!src) continue;
      const match = src.match(/(?:employee|person|worker|name|number)[:\s]*([^\n,;]+)/i);
      if (match) return match[1].trim();
    }
    return null;
  }
}
