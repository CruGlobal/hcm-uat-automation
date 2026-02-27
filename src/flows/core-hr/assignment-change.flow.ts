import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Flow: Assignment Change / Transfer
 * Tab: "Core - Assign Change/XFR"
 *
 * This flow differs from hire flows — it doesn't use the 3-step hire wizard.
 * Instead it:
 * 1. Navigates to Person Management
 * 2. Searches for a person (by name or number — field not yet identified in test data)
 * 3. Opens the person's assignment
 * 4. Initiates an assignment change action
 * 5. Fills effective date, action, reason
 * 6. Fills assignment field changes
 * 7. Submits
 *
 * Note: The test data for this tab uses "When - Effective date" instead of "When",
 * and doesn't have a separate person search field — the person may need to be
 * identified from generated test data.
 */
export class AssignmentChangeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search for person — test data doesn't have an explicit search field,
    // so we'll look for common person identifier fields
    const personName = getField(tc, 'Person Name') || getField(tc, 'Search for Person');
    const personNumber = getField(tc, 'Person Number') || getField(tc, 'Search for Person Number');
    if (personNumber) {
      await this.person.searchByPersonNumber(personNumber);
    } else if (personName) {
      await this.person.searchByName(personName);
    }

    // Initiate assignment change action
    await this.initiateAssignmentChange();

    // Fill effective date (this tab uses "When - Effective date")
    const effectiveDate = getField(tc, 'When - Effective date');
    if (effectiveDate) {
      await this.whenAndWhy.fillEffectiveDate(excelSerialToDate(effectiveDate));
    }

    // Fill action and reason
    await this.whenAndWhy.fillFromTestCase(tc);

    // Apply assignment changes
    await this.assignment.fillFromTestCase(tc);

    await this.submitAndVerify();
  }

  private async initiateAssignmentChange(): Promise<void> {
    const actionsButton = this.page.locator(
      'button:has-text("Actions"), [id*="Actions"], a[role="button"]:has-text("Actions")'
    ).first();

    const isVisible = await actionsButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await actionsButton.click();
      await this.page.waitForTimeout(2000);

      // Look for assignment change or transfer option
      const changeOption = this.page.locator(
        'td:has-text("Assignment Change"), li:has-text("Assignment Change"), ' +
        '[role="menuitem"]:has-text("Assignment Change"), ' +
        'td:has-text("Transfer"), li:has-text("Transfer"), [role="menuitem"]:has-text("Transfer")'
      ).first();
      if (await changeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await changeOption.click();
        await this.page.waitForTimeout(10000);
        await this.person.waitForJET();
      }
    }
  }
}
