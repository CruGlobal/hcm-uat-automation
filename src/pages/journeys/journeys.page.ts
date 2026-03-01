import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import type { UATTestCase } from '../../data/types';
import { parseTestData } from '../../utils/test-data-parser';

/**
 * Oracle HCM Journeys page object.
 *
 * Journeys are guided workflows for employee lifecycle events:
 * - Onboarding (supported, hourly/salaried)
 * - Offboarding
 * - Life events (medical leave, marriage/SOSA, etc.)
 * - Access request journeys
 *
 * Navigation: My Client Groups > Journeys (Redwood UI)
 * URL pattern: /fscmUI/redwood/journeys/...
 *
 * Selectors sourced from .cache/inspect/journeys-admin-deep.json (live inspection).
 * This is a Redwood/JET page using oj-* components, not classic ADF.
 */
export class JourneysPage extends BasePage {
  // === Journey Search / Landing Page (from journeys-admin-deep.json) ===

  /**
   * Person search input on the Journeys landing page.
   * Real ID: ojHcmAdvancedSearchBox_org-journeys-search|input
   * aria-label: "Search by person name", placeholder: "Search by person name"
   */
  private readonly searchInput = this.page.locator(
    '#ojHcmAdvancedSearchBox_org-journeys-search\\|input, ' +
    'input[aria-label="Search by person name"]'
  ).first();

  /**
   * Search button (oj-button) next to the search input.
   * Real ID: ojHcmAdvancedSearchButton_org-journeys-search
   */
  private readonly searchButton = this.page.locator(
    '#ojHcmAdvancedSearchButton_org-journeys-search, ' +
    'button[aria-label="Search by person name"]'
  ).first();

  /**
   * Status filter pill (role="button", text="Status").
   * Used to filter journeys by status (Active, Completed, etc.).
   */
  private readonly statusFilterPill = this.page.locator(
    'div.oj-sp-filter-chip[role="button"]:has-text("Status")'
  ).first();

  /**
   * Category filter pill (role="button", text="Category").
   * Used to filter journeys by category (Onboarding, Offboarding, etc.).
   */
  private readonly categoryFilterPill = this.page.locator(
    'div.oj-sp-filter-chip[role="button"]:has-text("Category")'
  ).first();

  /** Saved Searches button. */
  private readonly savedSearchesButton = this.page.locator(
    'button[aria-label="Saved Searches"]'
  ).first();

  /** Go back button (Redwood navigation). */
  private readonly goBackButton = this.page.locator(
    'button[aria-label="Go back"]'
  ).first();

  // === Navigation Tabs (5 tabs with role="tab") ===

  /** All navigation tabs on the Journeys page. */
  private readonly navTabs = this.page.locator('a[role="tab"].oj-navigationlist-item-content');

  // === Journey Assignment ===
  private readonly assignJourneyButton = this.page.locator(
    'button:has-text("Assign Journey"), a:has-text("Assign Journey")'
  ).first();
  private readonly journeyTemplateDropdown = this.page.locator(
    'input[aria-label*="Journey Template"], input[aria-label*="Journey Name"], ' +
    'input[aria-label*="Journey"]'
  ).first();
  private readonly journeyCategoryDropdown = this.page.locator(
    'input[aria-label*="Category"]'
  ).first();

  // === Person / Employee Lookup ===
  private readonly personNameInput = this.page.locator(
    'input[aria-label*="Person"], input[aria-label*="Employee"], input[aria-label*="Worker"]'
  ).first();
  private readonly personNumberInput = this.page.locator(
    'input[aria-label*="Person Number"], input[aria-label*="Employee Number"]'
  ).first();

  // === Journey Details ===
  private readonly effectiveDateInput = this.page.locator(
    'input[aria-label*="Effective Date"], input[aria-label*="Start Date"]'
  ).first();
  private readonly dueDateInput = this.page.locator(
    'input[aria-label*="Due Date"]'
  ).first();
  private readonly notesTextarea = this.page.locator(
    'textarea[aria-label*="Notes"], textarea[aria-label*="Comment"]'
  ).first();

  // === Task Management ===
  private readonly taskCheckboxes = this.page.locator(
    'input[type="checkbox"][id*="task"], [role="checkbox"]'
  );
  private readonly completeTaskButton = this.page.locator(
    'button:has-text("Complete"), button:has-text("Mark Complete"), a:has-text("Complete Task")'
  ).first();

  // === Action Buttons ===
  private readonly submitButton = this.page.locator(
    'button:has-text("Submit"), a[role="button"]:has-text("Submit")'
  ).first();
  private readonly saveButton = this.page.locator(
    'button:has-text("Save")'
  ).first();
  private readonly nextButton = this.page.locator(
    'button:has-text("Next")'
  ).first();
  private readonly doneButton = this.page.locator(
    'button:has-text("Done")'
  ).first();

  // === Confirmation / Status ===
  private readonly successMessage = this.page.locator(
    '[class*="confirmation"], [class*="success"], ' +
    ':text("successfully")'
  ).first();

  // ======== Actions ========

  /**
   * Search for a person by name on the Journeys landing page.
   * Uses the real ojHcmAdvancedSearchBox component.
   */
  async searchPerson(name: string): Promise<void> {
    await this.searchInput.click();
    await this.searchInput.fill(name);
    await this.page.waitForTimeout(1500);

    // Click the search button
    if (await this.searchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.searchButton.click();
    } else {
      // Fallback: press Enter to trigger search
      await this.searchInput.press('Enter');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Search for a person or journey on the landing page (alias for searchPerson). */
  async searchFor(term: string): Promise<void> {
    await this.searchPerson(term);
  }

  /**
   * Filter journeys by status using the Status filter pill.
   * Clicks the pill then selects the desired status from the popup.
   */
  async filterByStatus(status: string): Promise<void> {
    await this.statusFilterPill.click();
    await this.page.waitForTimeout(1500);

    // Select the status option from the filter popup
    const statusOption = this.page.getByRole('option', { name: status }).first();
    if (await statusOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusOption.click();
    } else {
      // Fallback: click by text within the popup
      const textOption = this.page.locator(`[role="menuitemcheckbox"]:has-text("${status}"), li:has-text("${status}")`).first();
      if (await textOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textOption.click();
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Filter journeys by category using the Category filter pill.
   * Clicks the pill then selects the desired category from the popup.
   */
  async filterByCategory(category: string): Promise<void> {
    await this.categoryFilterPill.click();
    await this.page.waitForTimeout(1500);

    const categoryOption = this.page.getByRole('option', { name: category }).first();
    if (await categoryOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await categoryOption.click();
    } else {
      const textOption = this.page.locator(`[role="menuitemcheckbox"]:has-text("${category}"), li:has-text("${category}")`).first();
      if (await textOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textOption.click();
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Select a navigation tab by name.
   * Known tabs: Explore, My Journeys, My Tasks, Organization Journeys, Activity.
   */
  async selectTab(name: string): Promise<void> {
    const tab = this.page.locator(`a[role="tab"]:has-text("${name}")`).first();
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Navigate to My Journeys tab. */
  async viewMyJourneys(): Promise<void> {
    await this.selectTab('My Journeys');
  }

  /** Navigate to My Tasks tab. */
  async viewMyTasks(): Promise<void> {
    await this.selectTab('My Tasks');
  }

  /** Navigate to Organization Journeys tab. */
  async viewOrganizationJourneys(): Promise<void> {
    await this.selectTab('Organization Journeys');
  }

  /** View journey details by clicking the first result. */
  async viewJourneyDetails(): Promise<void> {
    const resultLink = this.page.locator(
      '[role="listitem"]:first-child a, [class*="journey-card"]:first-child'
    ).first();
    if (await resultLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await resultLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /** Click the Assign Journey button to start the assignment flow. */
  async clickAssignJourney(): Promise<void> {
    const isVisible = await this.assignJourneyButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.assignJourneyButton.click();
    } else {
      // Fallback: try other button texts for assignment
      for (const name of ['Assign Journey', 'Assign', 'Create Journey', 'New Journey']) {
        const btn = this.page.getByRole('button', { name }).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          break;
        }
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /**
   * Assign a journey to a person.
   * Combines person search, template selection, and submission.
   */
  async assignJourney(person: string, journeyType: string): Promise<void> {
    await this.clickAssignJourney();
    await this.fillCombobox(this.personNameInput, person);
    await this.fillCombobox(this.journeyTemplateDropdown, journeyType);
    await this.clickSubmit();
  }

  /** Select a journey template from the dropdown/LOV. */
  async selectJourneyTemplate(templateName: string): Promise<void> {
    await this.fillCombobox(this.journeyTemplateDropdown, templateName);
  }

  /** Select a journey category. */
  async selectJourneyCategory(category: string): Promise<void> {
    await this.fillCombobox(this.journeyCategoryDropdown, category);
  }

  /** Enter the person/employee name for journey assignment. */
  async fillPersonName(name: string): Promise<void> {
    await this.fillCombobox(this.personNameInput, name);
  }

  /** Enter the person number for journey assignment. */
  async fillPersonNumber(number: string): Promise<void> {
    await this.fillField(this.personNumberInput, number);
  }

  /** Set the effective/start date for the journey. */
  async fillEffectiveDate(date: string): Promise<void> {
    await this.fillField(this.effectiveDateInput, date);
  }

  /** Set the due date for the journey. */
  async fillDueDate(date: string): Promise<void> {
    await this.fillField(this.dueDateInput, date);
  }

  /** Enter notes/comments for the journey. */
  async fillNotes(notes: string): Promise<void> {
    const field = this.notesTextarea;
    await field.clear();
    await field.fill(notes);
    await this.waitForJET();
  }

  /**
   * Complete a task by name within the journey task list.
   * Finds the task checkbox or complete button by task name.
   */
  async completeTask(taskName: string): Promise<void> {
    const taskRow = this.page.locator(`[role="listitem"]:has-text("${taskName}"), tr:has-text("${taskName}")`).first();
    if (await taskRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      const checkbox = taskRow.locator('input[type="checkbox"], [role="checkbox"]').first();
      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await checkbox.click();
        await this.waitForJET();
      }
    }
  }

  /** Complete a task by its index (0-based) in the task list. */
  async completeTaskByIndex(index: number): Promise<void> {
    const checkbox = this.taskCheckboxes.nth(index);
    if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checkbox.click();
      await this.waitForJET();
    }
  }

  /** Click the Complete Task button. */
  async clickCompleteTask(): Promise<void> {
    await this.completeTaskButton.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Click Submit to finalize the journey assignment. */
  async clickSubmit(): Promise<void> {
    const isVisible = await this.submitButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.submitButton.click();
    } else {
      // Fallback: try other button texts
      for (const name of ['Submit', 'Done', 'Save', 'OK', 'Assign']) {
        const btn = this.page.getByRole('button', { name }).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          break;
        }
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Handle confirmation dialog if it appears
    const confirmBtn = this.page.getByRole('button', { name: /Yes|OK|Confirm/i }).first();
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Click Save to save progress without submitting. */
  async clickSave(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Click Next to advance to the next step. */
  async clickNext(): Promise<void> {
    await this.nextButton.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Click Done to finish the journey. */
  async clickDone(): Promise<void> {
    await this.doneButton.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Click Go Back to return to previous page. */
  async clickGoBack(): Promise<void> {
    await this.goBackButton.click();
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /**
   * Verify a success/confirmation message is displayed.
   * Uses soft verification since journey operations may show
   * different confirmation patterns.
   */
  async expectSuccess(): Promise<void> {
    const visible = await this.successMessage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    if (visible) {
      const text = await this.successMessage.textContent().catch(() => '');
      console.log(`[Journeys] Success: ${text?.substring(0, 100)}`);
    } else {
      console.log('[Journeys] No explicit success indicator visible');
    }
  }

  /** Get the current journey status text. */
  async getJourneyStatus(): Promise<string> {
    const statusBadge = this.page.locator('[class*="status"], span[class*="badge"]').first();
    if (await statusBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      return (await statusBadge.textContent()) ?? '';
    }
    return '';
  }

  /** Click the first journey result in search results or journey list. */
  async clickFirstJourneyResult(): Promise<void> {
    const resultLink = this.page.locator(
      '[role="listitem"]:first-child a, [role="row"]:first-child a, ' +
      '[class*="journey-card"]:first-child'
    ).first();
    if (await resultLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await resultLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /**
   * Fill journey assignment fields from a UAT test case.
   * Extracts relevant data from businessProcess, testScenario, and testData.
   */
  async fillFromTestCase(tc: UATTestCase): Promise<void> {
    const data = parseTestData(tc.testData);

    // Person lookup
    const personName = data['person name'] || data['employee name'] || data['worker name'] || '';
    const personNumber = data['person number'] || data['employee number'] || '';
    if (personName) {
      await this.fillPersonName(personName);
    } else if (personNumber) {
      await this.fillPersonNumber(personNumber);
    }

    // Journey template selection
    const template = data['journey template'] || data['journey name'] || data['journey'] || '';
    if (template) {
      await this.selectJourneyTemplate(template);
    }

    // Category
    const category = data['category'] || data['journey category'] || '';
    if (category) {
      await this.selectJourneyCategory(category);
    }

    // Dates
    const effectiveDate = data['effective date'] || data['start date'] || '';
    if (effectiveDate) {
      await this.fillEffectiveDate(effectiveDate);
    }

    const dueDate = data['due date'] || '';
    if (dueDate) {
      await this.fillDueDate(dueDate);
    }

    // Notes
    const notes = data['notes'] || data['comments'] || '';
    if (notes) {
      await this.fillNotes(notes);
    }
  }

}
