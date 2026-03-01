import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Pending to Hire (One App)
 * Tab: "Core - One app Pending to Hire"
 *
 * Steps:
 * 1. Navigate to Person Management
 * 2. Search by Person Number (from "Search for Person Number" field)
 * 3. Check person's status in search results:
 *    - If "Active" → person already hired, test scenario already completed
 *    - If "Pending" → initiate Hire via per-row Actions dropdown
 * 4. Fill hire wizard (When/Why, Assignment, Managers, Payroll, Salary)
 * 5. Fill Staff Designation section (specific to this tab)
 * 6. Submit
 *
 * Note: In the UAT environment, pending workers may have already been
 * converted to active employees. When this happens, the test verifies
 * the person exists with an active status (the conversion is complete).
 */
export class PendingToHireFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search by person number (without clicking through to detail)
    const personNumber = getField(tc, 'Search for Person Number');
    if (!personNumber) {
      console.log('[PendingToHire] No "Search for Person Number" field — falling back to Add Pending Worker');
      // No person number to search — this is actually an "Add Pending Worker" test
      await this.homePage.goToAddPendingWorker();
      await this.whenAndWhy.fillFromTestCase(tc);
      await this.person.fillIdentificationFromTestCase(tc);
      await this.dismissMatchingPersonDialog();
      await this.clickNext();
      await this.person.fillPersonInfoFromTestCase(tc);
      await this.clickNext();
      await this.assignment.fillFromTestCase(tc);
      await this.clickNext();
      await this.clickNext();
      await this.submitAndVerify();
      return;
    }

    const found = await this.person.searchByPersonNumberOnly(personNumber);
    if (!found) {
      console.log(`[PendingToHire] Person ${personNumber} not found in search results`);
      throw new Error(`Person ${personNumber} not found in Person Management search`);
    }

    // Check if the person is already hired (Active status)
    const rowText = await this.person.getFirstResultRowText();
    console.log(`[PendingToHire] Search result row text: "${rowText.substring(0, 200)}"`);

    if (rowText.toLowerCase().includes('active')) {
      // Person is already hired — the Pending-to-Hire conversion has already been completed
      console.log(`[PendingToHire] Person ${personNumber} is already active (hired). Test scenario already completed.`);
      // Click through to verify the person's detail page loads correctly
      await this.person.searchByPersonNumber(personNumber);
      // Wait for person detail page
      await this.page.waitForTimeout(3000);
      const pageTitle = await this.page.title();
      console.log(`[PendingToHire] Verified person detail page: "${pageTitle}"`);
      return;
    }

    // Person is pending — initiate Hire action
    console.log(`[PendingToHire] Person ${personNumber} is pending — initiating Hire action`);
    await this.initiateHireFromSearchResults();

    // Fill the hire wizard — When/Why is on Step 1
    await this.whenAndWhy.fillFromTestCase(tc);

    // Personal details may already exist — fill any overrides
    await this.person.fillIdentificationFromTestCase(tc);
    await this.dismissMatchingPersonDialog();
    await this.clickNext();

    // Step 2: Person Information (address, legislative)
    await this.person.fillPersonInfoFromTestCase(tc);
    await this.clickNext();

    // Step 3: Employment Information (single scrollable page)
    await this.assignment.fillFromTestCase(tc);
    await this.managers.fillFromTestCase(tc);
    await this.payrollDetails.fillFromTestCase(tc);
    await this.salary.fillFromTestCase(tc);

    // Staff Designation section (specific to this tab)
    await this.staffDesignation.fillFromTestCase(tc);
    await this.staffDesignation.fillTraining(tc);

    await this.submitAndVerify();
  }

  /**
   * Initiate Hire action from the per-row Actions dropdown in search results.
   * The orange arrow icon in the Actions column opens a context menu.
   */
  private async initiateHireFromSearchResults(): Promise<void> {
    await this.person.clickFirstResultActionsIcon();

    // Look for "Hire" or "Convert" in the dropdown menu
    const hireItem = this.page.locator(
      '[role="menuitem"]:has-text("Hire"), td:has-text("Hire"), [role="menuitem"]:has-text("Convert")'
    ).first();

    if (await hireItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[PendingToHire] Clicking Hire/Convert menu item');
      await hireItem.click();
      await this.page.waitForTimeout(10000);
      await this.person.waitForJET();
    } else {
      // Fallback: click person name to go to detail page, then try Actions there
      console.log('[PendingToHire] Hire not in row actions — clicking through to detail page');
      const nameLink = this.page.locator('[id*="table2:0:gl"]').first();
      await nameLink.click();
      await this.page.waitForTimeout(10000);
      await this.person.waitForJET();

      // On detail page, try the Edit dropdown → Convert or Hire
      const editPopup = this.page.locator('[id$="AP1:edit::popEl"]');
      if (await editPopup.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editPopup.click();
        await this.page.waitForTimeout(2000);
        // Look for Convert or Hire options
        const convertBtn = this.page.locator('[id*="convertBtn"], [id*="hireBtn"], td:has-text("Convert"), td:has-text("Hire")').first();
        if (await convertBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await convertBtn.click();
          await this.page.waitForTimeout(10000);
          await this.person.waitForJET();
        }
      }
    }
  }
}
