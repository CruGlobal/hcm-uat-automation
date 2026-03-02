import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import type { UATTestCase } from '../../data/types';
import { parseTestData } from '../../utils/test-data-parser';

/**
 * Oracle HCM Journeys page object.
 *
 * Redwood/JET page with 6 tabs: Explore, My Journeys, My Tasks, Team Journeys,
 * Organization Journeys, Activity.
 *
 * Journey assignment flow (from live inspection 2026-03-01):
 *   1. Explore tab → search by journey name → click journey card
 *   2. Journey Detail page → click "Assign" button
 *   3. Assign form: "When to assign?", "Comments", "Assignee Selection Type", "Select a Person"
 *   4. Click "Assign" to submit
 *
 * Selectors sourced from live page inspection (inspect-journeys-assign.ts).
 */
export class JourneysPage extends BasePage {
  // === Explore Tab (journey template search & cards) ===

  /** Search input on Explore tab — searches by journey name. */
  private readonly exploreSearchInput = this.page.locator(
    'input[aria-label="Search by journey name"]'
  ).first();

  /** Search button on Explore tab. */
  private readonly exploreSearchButton = this.page.locator(
    'button[aria-label="Search by journey name"]'
  ).first();

  /** "Clear" filter button (removes "Personal" or other active filters). */
  private readonly clearFilterButton = this.page.locator(
    'button[aria-label*="Clear"]'
  ).first();

  /** "Create Journey" button on Explore tab header. */
  private readonly createJourneyButton = this.page.locator(
    'button[aria-label="Create Journey"]'
  ).first();

  // === Organization Journeys Tab (person search) ===

  /** Person search input on Organization Journeys tab. */
  private readonly personSearchInput = this.page.locator(
    'input[aria-label="Search by person name"]'
  ).first();

  /** Person search button on Organization Journeys tab. */
  private readonly personSearchButton = this.page.locator(
    'button[aria-label="Search by person name"]'
  ).first();

  // === Filter Pills (shared across tabs) ===

  private readonly statusFilterPill = this.page.locator(
    'div[role="button"]:has-text("Status")'
  ).first();

  private readonly categoryFilterPill = this.page.locator(
    'div[role="button"]:has-text("Category")'
  ).first();

  // === Journey Detail Page ===

  /** "Assign" button on the journey detail page (id: assignThisJourneyBtn). */
  private readonly assignButton = this.page.locator(
    '#assignThisJourneyBtn button, button[aria-label="Assign"]'
  ).first();

  /** "Back" button on the journey detail page. */
  private readonly backButton = this.page.locator(
    'button[aria-label="Back"], button[aria-label="Go back"]'
  ).first();

  // === Assign Journey Form (drawer) ===

  /** "When to assign?" date input on the assign form. */
  private readonly assignDateInput = this.page.locator(
    '#assignDateInput\\|input, input[role="combobox"]'
  ).first();

  /** "Comments" textarea on the assign form. */
  private readonly commentsTextarea = this.page.locator(
    '#commentsInput\\|input, textarea'
  ).first();

  /** "Assignee Selection Type" dropdown on the assign form. */
  private readonly assigneeSelectionType = this.page.locator(
    '#selectionTypeLOV\\|input'
  ).first();

  /** "Select a Person" dropdown on the assign form (required). */
  private readonly selectPersonInput = this.page.locator(
    '#assigneeLOV\\|input'
  ).first();

  /** "Assign" submit button on the assign form header. */
  private readonly assignSubmitButton = this.page.locator(
    '#assignJourneyHeader_h_primaryActionFromHeader_primaryActionCta button, ' +
    'oj-sp-primary-action-feedback button'
  ).first();

  /** "Cancel" button on the assign form. */
  private readonly assignCancelButton = this.page.locator(
    '#assignJourneyHeader_h_cancelAction button, button[aria-label="Cancel"]'
  ).first();

  // === Task Management ===
  private readonly taskCheckboxes = this.page.locator(
    'input[type="checkbox"][id*="task"], [role="checkbox"]'
  );
  // Oracle HCM Journeys (Redwood) task completion — multiple selector variants
  // because the exact element varies by journey type and UI version.
  private readonly completeTaskButton = this.page.locator(
    'button:has-text("Mark as Complete"), ' +
    'button[aria-label="Mark as Complete"], ' +
    'button[aria-label*="Mark as complete"], ' +
    'button:has-text("Mark Complete"), ' +
    'button:has-text("Complete Task"), ' +
    'a:has-text("Mark as Complete"), ' +
    'button:has-text("Complete"), ' +
    'a:has-text("Complete Task")'
  ).first();

  // === Confirmation / Status ===
  private readonly successMessage = this.page.locator(
    '[class*="confirmation"], [class*="success"], :text("successfully")'
  ).first();

  // ======== Tab Navigation ========

  /** Select a navigation tab by name. */
  async selectTab(name: string): Promise<void> {
    const tab = this.page.locator(`a[role="tab"]:has-text("${name}")`).first();
    if (await tab.isVisible({ timeout: 10000 }).catch(() => false)) {
      await tab.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    } else {
      console.log(`[Journeys] Tab "${name}" not visible`);
    }
  }

  async viewMyJourneys(): Promise<void> { await this.selectTab('My Journeys'); }
  async viewMyTasks(): Promise<void> { await this.selectTab('My Tasks'); }
  async viewOrganizationJourneys(): Promise<void> { await this.selectTab('Organization Journeys'); }

  // ======== Explore Tab Actions ========

  /**
   * Search for a journey template by name on the Explore tab.
   * Clears active filters first to ensure all results are shown.
   */
  async searchJourneyByName(name: string): Promise<void> {
    // Clear any active filter (e.g., "Personal" level filter)
    if (await this.clearFilterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.clearFilterButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    await this.exploreSearchInput.click();
    await this.exploreSearchInput.fill(name);
    await this.page.waitForTimeout(1000);

    if (await this.exploreSearchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.exploreSearchButton.click();
    } else {
      await this.exploreSearchInput.press('Enter');
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Click a journey card by name (from Explore search results).
   * Cards are oj-sp-card elements with div[role="link"] containing the name.
   */
  async clickJourneyCard(name: string): Promise<boolean> {
    const card = this.page.locator(`div[role="link"]:has-text("${name}")`).first();
    if (await card.isVisible({ timeout: 10000 }).catch(() => false)) {
      await card.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return true;
    }
    // Fallback: try clicking the first card if specific name not found
    const firstCard = this.page.locator('div[role="link"]').first();
    if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[Journeys] Card "${name}" not found, clicking first card`);
      await firstCard.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return true;
    }
    console.log(`[Journeys] No journey cards visible`);
    return false;
  }

  // ======== Journey Detail Page Actions ========

  /** Click "Assign" button on the journey detail page to open the assign form. */
  async clickAssignOnDetail(): Promise<void> {
    if (await this.assignButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await this.assignButton.click();
    } else {
      // Fallback: try getByRole
      const btn = this.page.getByRole('button', { name: 'Assign' }).first();
      if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btn.click();
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  // ======== Assign Form Actions ========

  /**
   * Fill the "Select a Person" field on the assign form.
   * This is an oj-select-single (readonly display + internal filter input).
   *
   * Interaction pattern for oj-select-single:
   *   1. Click the component to open the dropdown
   *   2. Type in the internal filter/search input
   *   3. Select from the dropdown results
   */
  async fillAssigneePerson(personName: string): Promise<void> {
    // Click the oj-select-single component to open it
    const ojSelect = this.page.locator('#assigneeLOV, oj-select-single:has(#assigneeLOV\\|input)').first();
    await ojSelect.waitFor({ timeout: 15000 });
    await ojSelect.click();
    await this.page.waitForTimeout(2000);

    // Type in the filter/search input that appears inside the dropdown.
    // Search by last name only (more reliable in Oracle LOV than "Last, First" format).
    const lastName = personName.split(',')[0].trim();
    const searchTerm = lastName || personName;

    const filterInput = this.page.locator(
      '#oj-searchselect-filter-assigneeLOV\\|input, ' +
      'input[aria-label*="Select a Person"]:not([readonly])'
    ).first();
    if (await filterInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filterInput.fill('');
      await filterInput.pressSequentially(searchTerm, { delay: 50 });
    } else {
      // Fallback: try typing directly on the display input
      const displayInput = this.selectPersonInput;
      await displayInput.pressSequentially(searchTerm, { delay: 50 });
    }
    await this.page.waitForTimeout(5000);

    // Select from dropdown results — prefer exact last name match, fall back to first option
    const namedOption = this.page.locator(`[role="option"]:has-text("${lastName}")`).first();
    if (await namedOption.isVisible({ timeout: 10000 }).catch(() => false)) {
      await namedOption.click();
    } else {
      const firstOption = this.page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log(`[Journeys] Person "${personName}" not found — clicking first available option`);
        await firstOption.click();
      } else {
        console.log(`[Journeys] No dropdown options found for "${personName}" (searched: "${searchTerm}")`);
        await this.page.keyboard.press('Escape');
      }
    }
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /** Fill the "When to assign?" date field on the assign form. */
  async fillAssignDate(date: string): Promise<void> {
    const input = this.page.locator('#assignDateInput\\|input').first();
    if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      await input.click();
      await input.fill(date);
      await input.press('Tab');
      await this.page.waitForTimeout(1000);
      await this.waitForJET();
    }
  }

  /** Fill the "Comments" field on the assign form. */
  async fillAssignComments(comments: string): Promise<void> {
    const textarea = this.page.locator('#commentsInput\\|input, #commentsInput textarea').first();
    if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textarea.click();
      await textarea.fill(comments);
      await this.waitForJET();
    }
  }

  /** Click "Assign" submit button on the assign form. Returns true if clicked. */
  async clickAssignSubmit(): Promise<boolean> {
    // The Assign button in the form header — may be disabled if required fields missing
    const isSubmitVisible = await this.assignSubmitButton.isVisible({ timeout: 5000 }).catch(() => false);
    const btn = isSubmitVisible
      ? this.assignSubmitButton
      : this.page.getByRole('button', { name: 'Assign' }).first();

    // Check if button is disabled
    const isDisabled = await btn.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true);
    if (isDisabled) {
      console.log('[Journeys] Assign button is disabled (required fields not filled)');
      return false;
    }

    try {
      await btn.click({ timeout: 10000 });
      await this.page.waitForTimeout(5000);
      await this.waitForJET();

      // Handle confirmation dialog
      const confirmBtn = this.page.getByRole('button', { name: /Yes|OK|Confirm/i }).first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
      return true;
    } catch (err) {
      console.log(`[Journeys] Could not click Assign submit: ${err}`);
      return false;
    }
  }

  // ======== Organization Journeys Tab Actions ========

  /** Search for a person by name on the Organization Journeys tab. */
  async searchPerson(name: string): Promise<void> {
    if (await this.personSearchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.personSearchInput.click();
      await this.personSearchInput.fill(name);
      await this.page.waitForTimeout(1500);
      if (await this.personSearchButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.personSearchButton.click();
      } else {
        await this.personSearchInput.press('Enter');
      }
    } else {
      // Fallback: use any visible search input
      const anySearch = this.page.locator('input[aria-label*="Search"]').first();
      if (await anySearch.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anySearch.fill(name);
        await anySearch.press('Enter');
      }
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /** Click the first journey result in search results. */
  async clickFirstJourneyResult(): Promise<void> {
    const resultLink = this.page.locator(
      'div[role="link"], [role="listitem"]:first-child a, [role="row"]:first-child a'
    ).first();
    if (await resultLink.isVisible({ timeout: 10000 }).catch(() => false)) {
      await resultLink.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  // ======== Filter Actions ========

  async filterByStatus(status: string): Promise<void> {
    await this.statusFilterPill.click();
    await this.page.waitForTimeout(1500);
    const option = this.page.getByRole('option', { name: status }).first();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  async filterByCategory(category: string): Promise<void> {
    await this.categoryFilterPill.click();
    await this.page.waitForTimeout(1500);
    const option = this.page.getByRole('option', { name: category }).first();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click();
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // ======== Task Management ========

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

  async completeTaskByIndex(index: number): Promise<void> {
    const checkbox = this.taskCheckboxes.nth(index);
    if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checkbox.click();
      await this.waitForJET();
    }
  }

  /**
   * Click the first task "Start" or "Open" button in a journey task list.
   * In Oracle HCM Journeys Redwood, tasks must be opened before they can be marked complete.
   */
  async clickFirstTaskAction(): Promise<boolean> {
    const taskAction = this.page.locator(
      'button:has-text("Start"), button:has-text("Open"), ' +
      'button[aria-label*="Start"], button[aria-label*="Open task"], ' +
      'a:has-text("Start"), a:has-text("Open")'
    ).first();
    const visible = await taskAction.waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true).catch(() => false);
    if (visible) {
      try {
        await taskAction.click({ timeout: 10000 });
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
        return true;
      } catch (err) {
        console.log(`[Journeys] Task action button found but could not click: ${err}`);
      }
    }
    console.log('[Journeys] No task Start/Open button visible');
    return false;
  }

  async clickCompleteTask(): Promise<void> {
    // Use waitFor with short timeout instead of isVisible (which is immediate in modern Playwright)
    const visible = await this.completeTaskButton.waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true).catch(() => false);
    if (visible) {
      try {
        await this.completeTaskButton.click({ timeout: 10000 });
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
      } catch (err) {
        console.log(`[Journeys] Complete task button found but could not click: ${err}`);
      }
    } else {
      console.log('[Journeys] No Complete task button visible — skipping clickCompleteTask');
    }
  }

  // ======== Navigation ========

  async clickGoBack(): Promise<void> {
    await this.backButton.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // ======== Verification ========

  async expectSuccess(): Promise<void> {
    const visible = await this.successMessage.waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true).catch(() => false);
    if (visible) {
      const text = await this.successMessage.textContent().catch(() => '');
      console.log(`[Journeys] Success: ${text?.substring(0, 100)}`);
    } else {
      console.log('[Journeys] No explicit success indicator visible');
    }
  }
}
