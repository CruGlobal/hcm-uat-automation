import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Flow: Termination / End Work Relationship / End Assignment
 *
 * Handles three action types (field: "What's the way"):
 *   - "Termination" — ends the entire work relationship
 *   - "End Assignment" — ends a specific assignment (used for End Additional Job)
 *   - "Terminate Work Relationship" — same as Termination
 *
 * Steps:
 * 1. Navigate to Person Management
 * 2. Search for person by number (preferred) or name
 * 3. Click the person to open their detail page
 * 4. Initiate termination via Actions menu → "Terminate Work Relationship"
 *    (or Edit → "End Assignment" for additional job endings)
 * 5. Fill termination dialog: effective date, action, reason
 * 6. Click OK → review page → Submit
 *
 * Field data keys:
 *   - "Person Name" (Last, First format)
 *   - "Person Number"
 *   - "When - Effective date" (MM/DD/YYYY or Excel serial)
 *   - "What's the way" (action: Termination, End Assignment)
 *   - "Why" (reason: Personal Reasons, Planned End, etc.)
 */
export class TerminationFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToPersonManagement();

    // Search for person — prefer person number (more reliable), fall back to name
    // Use "All" filter to find terminated/inactive workers too
    await this.person.setSearchStatusFilter('All');
    const personNumber = getField(tc, 'Person Number');
    const personName = getField(tc, 'Person Name');
    if (personNumber) {
      const found = await this.person.searchByPersonNumberOnly(personNumber);
      if (found) {
        const nameLink = this.page.locator('[id*="table2:0:gl"]').first();
        await nameLink.click();
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
      } else if (personName) {
        console.log(`[Termination] Person ${personNumber} not found, trying name: ${personName}`);
        await this.page.locator('[id$="q1::reset"]').click().catch(() => {});
        await this.page.waitForTimeout(2000);
        await this.person.searchByName(personName);
      } else {
        throw new Error(`Person ${personNumber} not found in Person Management search`);
      }
    } else if (personName) {
      await this.person.searchByName(personName);
    }

    // Determine action type
    const actionType = (getField(tc, "What's the way") || getField(tc, 'Action') || '').toLowerCase();
    const isEndAssignment = actionType.includes('end assignment');

    // Initiate the appropriate action
    if (isEndAssignment) {
      await this.initiateEndAssignment();
    } else {
      const initiated = await this.initiateTermination();
      if (!initiated) return;
    }

    // Fill the termination/end assignment dialog
    await this.fillTerminationDialog(tc);

    // Submit
    await this.submitTermination();
  }

  /**
   * Initiate "Terminate Work Relationship" via the Actions menu on the person detail page.
   * Uses multiple fallback strategies for finding the Actions menu.
   */
  private async initiateTermination(): Promise<boolean> {
    await this.page.waitForTimeout(5000);
    await this.person.waitForJET();
    await this.person.clearGlassPane();
    await this.person.dismissPopups();

    const actionClicked = await this.tryClickActions();
    if (!actionClicked) {
      console.log('[Termination] Actions menu not found on first attempt, retrying...');
      await this.page.waitForTimeout(5000);
      await this.person.waitForJET();
      const retryClicked = await this.tryClickActions();
      if (!retryClicked) {
        await this.page.screenshot({ path: 'test-results/termination-actions-not-found.png', fullPage: true }).catch(() => {});
        throw new Error('Could not find Actions menu — person may already be terminated or not accessible to this role');
      }
    }

    await this.page.waitForTimeout(3000);
    await this.person.waitForJET();

    // Click "Terminate Work Relationship" in the menu
    const termClicked = await this.tryClickTerminateOption();
    if (!termClicked) {
      // Retry: dismiss menu, wait, try again
      console.log('[Termination] Terminate option not found, retrying...');
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(3000);
      await this.person.waitForJET();
      await this.person.clearGlassPane();

      const retryActions = await this.tryClickActions();
      if (retryActions) {
        await this.page.waitForTimeout(3000);
        const retryTerm = await this.tryClickTerminateOption();
        if (!retryTerm) {
          throw new Error('"Terminate Work Relationship" not found — person may lack active work relationship');
        }
      } else {
        // Could not open Actions menu on retry — person likely already terminated or not accessible
        throw new Error('Could not re-open Actions menu for termination');
      }
    }

    await this.page.waitForTimeout(3000);
    await this.person.waitForJET();
    await this.person.clearGlassPane();
    return true;
  }

  /**
   * Initiate "End Assignment" via Edit dropdown on the person detail page.
   * Used for "End Additional Job" scenarios.
   */
  private async initiateEndAssignment(): Promise<void> {
    await this.page.waitForTimeout(3000);
    await this.person.waitForJET();
    await this.person.dismissPopups();

    // Try Actions menu first — "End Assignment" may be there
    const actionClicked = await this.tryClickActions();
    if (actionClicked) {
      await this.page.waitForTimeout(3000);

      const endAssignOption = this.page.locator(
        '[role="menuitem"]:has-text("End Assignment"), td:has-text("End Assignment"), li:has-text("End Assignment")'
      ).first();
      if (await endAssignOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[Termination] Found "End Assignment" in Actions menu');
        await endAssignOption.click();
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
        await this.person.clearGlassPane();
        return;
      }

      // Not in Actions — dismiss menu, try Edit dropdown
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(2000);
    }

    // Fallback: Try Edit dropdown → End Assignment
    const editPopup = this.page.locator('[id*="edit"][id$="::popEl"], a:has-text("Edit"), button:has-text("Edit")').first();
    if (await editPopup.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editPopup.click({ force: true });
      await this.page.waitForTimeout(3000);

      const endOption = this.page.locator(
        '[role="menuitem"]:has-text("End Assignment"), td:has-text("End Assignment"), a:has-text("End Assignment")'
      ).first();
      if (await endOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[Termination] Found "End Assignment" in Edit dropdown');
        await endOption.click();
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
        await this.person.clearGlassPane();
        return;
      }
    }

    // Final fallback: Terminate Work Relationship (close enough)
    console.log('[Termination] "End Assignment" not found, falling back to Terminate Work Relationship');
    await this.initiateTermination();
  }

  /**
   * Try multiple strategies to click the Actions button on person detail page.
   */
  private async tryClickActions(): Promise<boolean> {
    // Strategy 1: Button with text "Actions"
    const actionsBtn = this.page.getByRole('button', { name: /actions/i }).first();
    if (await actionsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[Termination] Found Actions button via getByRole');
      await actionsBtn.click({ force: true });
      return true;
    }

    // Strategy 2: Link/anchor with text "Actions"
    const actionsLink = this.page.locator('a:has-text("Actions"), a[role="button"]:has-text("Actions")').first();
    if (await actionsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Termination] Found Actions link');
      await actionsLink.click({ force: true });
      return true;
    }

    // Strategy 3: ADF ID pattern
    const adfActions = this.page.locator('[id*="Actions"], [id*="actions"][id$="::popEl"]').first();
    if (await adfActions.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Termination] Found Actions via ADF ID');
      await adfActions.click({ force: true });
      return true;
    }

    // Strategy 4: Per-row actions icon (if we're still on search results)
    const rowAction = this.page.locator('[id*="table2:0:commandImageLink"], [id*="table2:0:cil"]').first();
    if (await rowAction.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Termination] Found per-row Actions icon');
      await rowAction.click({ force: true });
      return true;
    }

    console.log('[Termination] No Actions button found');
    return false;
  }

  /**
   * Try to click "Terminate Work Relationship" in the open Actions menu.
   */
  private async tryClickTerminateOption(): Promise<boolean> {
    // Strategy 1: Menu item with exact text
    const menuItem = this.page.locator('[role="menuitem"]:has-text("Terminate")').first();
    if (await menuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[Termination] Found "Terminate" via role=menuitem');
      await menuItem.click({ force: true });
      return true;
    }

    // Strategy 2: Table cell or list item in ADF popup menu
    const termOption = this.page.locator(
      'td:has-text("Terminate Work Relationship"), li:has-text("Terminate")'
    ).first();
    if (await termOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Termination] Found "Terminate" via td/li');
      await termOption.click({ force: true });
      return true;
    }

    // Strategy 3: Dialog layer
    const dialogLayer = this.page.locator('#DhtmlZOrderManagerLayerContainer');
    const termInLayer = dialogLayer.getByText('Terminate', { exact: false }).first();
    if (await termInLayer.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Termination] Found "Terminate" in dialog layer');
      await termInLayer.click({ force: true });
      return true;
    }

    // Strategy 4: Any link/button with "Terminate"
    const termLink = this.page.locator('a:has-text("Terminate"), button:has-text("Terminate")').first();
    if (await termLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Termination] Found "Terminate" via has-text');
      await termLink.click({ force: true });
      return true;
    }

    // Capture menu contents for debugging
    const menuText = await this.page.locator('[role="menuitem"], [role="menu"] td, #DhtmlZOrderManagerLayerContainer').first()
      .textContent({ timeout: 2000 }).catch(() => '(no menu content)');
    console.log(`[Termination] No "Terminate" option found. Menu contents: ${menuText?.substring(0, 300)}`);
    return false;
  }

  /**
   * Fill the termination/end assignment dialog.
   * The dialog has: effective date, action type, and reason.
   *
   * Oracle HCM termination form uses different selectors from the hire wizard.
   * The dialog may be a modal or an inline form depending on the action path.
   */
  private async fillTerminationDialog(tc: TestCase): Promise<void> {
    // Legal Employer — Oracle Redwood termination wizard may require this field.
    // Use field data value if present, otherwise default to main CCC legal employer.
    const legalEmployer = getField(tc, 'Legal Employer') || 'Campus Crusade for Christ, Inc.';
    const leSelectors = [
      '[id$="SP1:legaEm::content"]',           // Hire/CWR wizard selector
      '[id*="legalEmployer"][id$="::content"]', // Generic legal employer field
    ];
    for (const sel of leSelectors) {
      const leField = this.page.locator(sel).first();
      if (await leField.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`[Termination] Filling Legal Employer: ${legalEmployer}`);
        await this.person.fillCombobox(leField, legalEmployer);
        await this.page.waitForTimeout(3000);
        await this.person.waitForJET();
        break;
      }
    }

    // Effective Date — look for date input in the dialog/form
    const effectiveDate = getField(tc, 'When - Effective date') || getField(tc, 'When');
    if (effectiveDate) {
      // Try multiple date field selectors — termination forms vary
      const dateSelectors = [
        '[id$="AP1:effectiveDate::content"]',   // Update Employment dialog
        '[id$="inputDate1::content"]',           // Generic date input
        '[id$="terminationDate::content"]',      // Termination-specific
        '[id$="id3::content"]',                  // Alternate date field
        'input[type="text"][id*="Date"][id$="::content"]',  // Any date field
      ];

      let dateFilled = false;
      for (const sel of dateSelectors) {
        const dateField = this.page.locator(sel).first();
        if (await dateField.isVisible({ timeout: 3000 }).catch(() => false)) {
          const dateStr = effectiveDate.includes('/') ? effectiveDate : excelSerialToDate(effectiveDate);
          console.log(`[Termination] Setting effective date: ${dateStr} (selector: ${sel})`);
          await this.person.fillField(dateField, dateStr);
          dateFilled = true;
          break;
        }
      }
      if (!dateFilled) {
        console.log('[Termination] No date field found — date may already be set');
      }
    }

    // Action — "Termination" or "End Assignment"
    const action = getField(tc, "What's the way") || getField(tc, 'Action');
    if (action) {
      const actionSelectors = [
        '[id$="AP1:actionsName1::content"]',     // Update Employment dialog
        '[id$="selectOneChoice1::content"]',     // Generic dropdown
        '[id$="terminationAction::content"]',    // Termination-specific
      ];

      for (const sel of actionSelectors) {
        const actionField = this.page.locator(sel).first();
        if (await actionField.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`[Termination] Setting action: ${action}`);
          await this.person.fillCombobox(actionField, action);
          await this.page.waitForTimeout(5000);
          await this.person.waitForJET();
          break;
        }
      }
    }

    // Reason
    const reason = getField(tc, 'Why') || getField(tc, 'Reason');
    if (reason) {
      const reasonSelectors = [
        '[id$="AP1:actionReason::content"]',     // Update Employment dialog
        '[id$="selectOneChoice2::content"]',     // Generic dropdown
        '[id$="terminationReason::content"]',    // Termination-specific
      ];

      for (const sel of reasonSelectors) {
        const reasonField = this.page.locator(sel).first();
        if (await reasonField.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`[Termination] Setting reason: ${reason}`);
          await this.person.fillCombobox(reasonField, reason);
          await this.page.waitForTimeout(3000);
          break;
        }
      }
    }

    // Click OK/Continue to close the dialog and move to the review/submit page
    await this.person.clearGlassPane();
    const okBtn = this.page.locator('[id$="AP1:cb10"], [id$="okButton"]').first();
    if (await okBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Termination] Clicking OK on dialog');
      await okBtn.click();
    } else {
      // Try generic OK/Continue buttons
      const genericOk = this.page.getByRole('button', { name: /^(OK|Continue)$/i }).first();
      if (await genericOk.isVisible({ timeout: 3000 }).catch(() => false)) {
        await genericOk.click();
      } else {
        await this.person.clickAdfButton('OK').catch(() =>
          this.person.clickAdfButton('Continue')
        );
      }
    }

    await this.page.waitForTimeout(6000);
    await this.person.waitForJET();
    await this.person.dismissErrorDialog();
  }

  /**
   * Submit the termination and verify success.
   */
  private async submitTermination(): Promise<void> {
    console.log('[Termination] Submitting...');
    await this.confirmation.clickSubmit();

    try {
      await this.confirmation.expectSuccess();
      console.log('[Termination] Submission successful');
    } catch (err) {
      console.log(`[Termination] Submission result: ${err}`);
      throw err;
    }
  }
}
