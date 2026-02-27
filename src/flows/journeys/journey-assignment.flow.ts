import { type Page } from '@playwright/test';
import { BaseJourneysFlow } from './base-journeys.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Journey Assignment and Task Management
 * Module: Journeys
 *
 * Handles:
 * - Assigning journeys to employees (onboarding, offboarding, life events, access requests)
 * - Filling journey details (template, person, dates)
 * - Submitting the assignment
 * - Journey task completion and viewing
 *
 * Routes based on journey type derived from businessProcess field:
 * - Onboarding (supported, hourly, salaried)
 * - Offboarding
 * - Life events (medical leave, marriage/SOSA, etc.)
 * - Access requests
 * - Task management (viewing/completing tasks)
 *
 * Uses real Redwood/JET selectors from journeys-admin-deep.json:
 * - Person search: ojHcmAdvancedSearchBox with aria-label "Search by person name"
 * - Filter pills: Status, Category (role="button")
 * - Tabs: Explore, My Journeys, My Tasks, Organization Journeys, Activity
 */
export class JourneyAssignmentFlow extends BaseJourneysFlow {
  constructor(page: Page) {
    super(page);
  }

  /** Execute the journey assignment flow for a UAT test case. */
  async execute(tc: UATTestCase): Promise<void> {
    await this.loginAndNavigate();

    const journeyType = this.resolveJourneyType(tc);

    switch (journeyType) {
      case 'onboarding':
        await this.executeOnboarding(tc);
        break;
      case 'offboarding':
        await this.executeOffboarding(tc);
        break;
      case 'life-event':
        await this.executeLifeEvent(tc);
        break;
      case 'access-request':
        await this.executeAccessRequest(tc);
        break;
      case 'task-completion':
        await this.executeTaskCompletion(tc);
        break;
      case 'view-journeys':
        await this.executeViewJourneys(tc);
        break;
      case 'view-tasks':
        await this.executeViewTasks(tc);
        break;
      default:
        await this.executeGenericJourney(tc);
        break;
    }
  }

  /**
   * Resolve the journey type from the test case's businessProcess and testScenario fields.
   * Returns a normalized journey type string.
   */
  private resolveJourneyType(tc: UATTestCase): string {
    const bp = (tc.businessProcess + ' ' + tc.testScenario).toLowerCase();

    if (bp.includes('onboarding') || bp.includes('onboard') || bp.includes('new hire')) {
      return 'onboarding';
    }
    if (bp.includes('offboarding') || bp.includes('offboard') || bp.includes('termination journey')) {
      return 'offboarding';
    }
    if (
      bp.includes('life event') || bp.includes('medical leave') ||
      bp.includes('marriage') || bp.includes('sosa') ||
      bp.includes('leave of absence') || bp.includes('parental')
    ) {
      return 'life-event';
    }
    if (bp.includes('access request') || bp.includes('provisioning')) {
      return 'access-request';
    }
    if (bp.includes('task completion') || bp.includes('complete task') || bp.includes('checklist')) {
      return 'task-completion';
    }
    if (bp.includes('view journey') || bp.includes('my journeys')) {
      return 'view-journeys';
    }
    if (bp.includes('view task') || bp.includes('my tasks')) {
      return 'view-tasks';
    }

    return 'generic';
  }

  /** Execute an onboarding journey assignment. */
  private async executeOnboarding(tc: UATTestCase): Promise<void> {
    // Navigate to Organization Journeys tab to assign
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.journeysPage.fillFromTestCase(tc);
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-onboarding-${tc.testId}`);
  }

  /** Execute an offboarding journey assignment. */
  private async executeOffboarding(tc: UATTestCase): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.journeysPage.fillFromTestCase(tc);
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-offboarding-${tc.testId}`);
  }

  /** Execute a life event journey assignment. */
  private async executeLifeEvent(tc: UATTestCase): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.journeysPage.fillFromTestCase(tc);
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-life-event-${tc.testId}`);
  }

  /** Execute an access request journey assignment. */
  private async executeAccessRequest(tc: UATTestCase): Promise<void> {
    await this.journeysPage.selectTab('Organization Journeys');
    await this.journeysPage.clickAssignJourney();
    await this.journeysPage.fillFromTestCase(tc);
    await this.journeysPage.clickSubmit();
    await this.journeysPage.screenshot(`journey-access-request-${tc.testId}`);
  }

  /** Execute task completion within a journey. */
  private async executeTaskCompletion(tc: UATTestCase): Promise<void> {
    // Navigate to My Tasks tab
    await this.journeysPage.viewMyTasks();

    // Search for the person if provided
    const personRef = this.extractPersonFromTestData(tc);
    if (personRef) {
      await this.journeysPage.searchPerson(personRef);
    }

    // Click the first journey result to view tasks
    await this.journeysPage.clickFirstJourneyResult();

    // Complete the first available task
    await this.journeysPage.completeTaskByIndex(0);
    await this.journeysPage.clickCompleteTask();
    await this.journeysPage.screenshot(`journey-task-complete-${tc.testId}`);
  }

  /** View journeys list (My Journeys tab). */
  private async executeViewJourneys(tc: UATTestCase): Promise<void> {
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
  private async executeViewTasks(tc: UATTestCase): Promise<void> {
    await this.journeysPage.viewMyTasks();
    await this.journeysPage.screenshot(`journey-tasks-${tc.testId}`);
  }

  /** Execute a generic journey assignment (fallback for unrecognized types). */
  private async executeGenericJourney(tc: UATTestCase): Promise<void> {
    await this.journeysPage.clickAssignJourney();
    await this.journeysPage.fillFromTestCase(tc);
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
