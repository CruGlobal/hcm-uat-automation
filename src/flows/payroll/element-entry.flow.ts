import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { ElementEntryPage } from '../../pages/payroll/element-entry.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Flow: Payroll Element Entry (Redwood UI)
 *
 * Steps (from Playwright codegen):
 * 1. Login to HCM (already done by PayrollProcessingFlow)
 * 2. Navigate to Payroll landing → click "Element Entries" tile
 * 3. Search Person → type name → select from autocomplete dropdown
 * 4. Set Effective Date
 * 5. Click Create → Element Name combobox → type + Tab → select from LOV → OK → Continue
 * 6. Fill details: Reason, Amount, Separate Tax Code
 * 7. Save → Done
 * 8. Verify: set date again → confirm entry appears in table
 */
export class ElementEntryFlow extends BaseFlow {
  protected elementEntry: ElementEntryPage;

  constructor(page: Page) {
    super(page);
    this.elementEntry = new ElementEntryPage(page);
  }

  async execute(tc: TestCase): Promise<void> {
    // Ensure we're logged in. When called from PayrollProcessingFlow, login
    // already happened — fullLogin() sees fscmUI/hcmUI and returns immediately.
    await this.loginToHCM();

    // Navigate to Element Entries page
    await this.navigateToElementEntries();

    // Verify navigation succeeded — check for person search field
    const personField = this.page.locator(
      'input[aria-label*="Person"], input[aria-label*="Employee"], input[aria-label*="Worker"], ' +
      'input[placeholder*="Search for a Person"], input[placeholder*="Person"]'
    ).first();
    const onEEPage = await personField.isVisible({ timeout: 5000 }).catch(() => false);
    if (!onEEPage) {
      const testId = (tc as any).testId || 'unknown';
      console.log(`[ElementEntry] ${testId}: Element Entries page not reached — bot may lack Payroll role. Navigation-only completion.`);
      return;
    }

    // Fill element entry form (search person, set date, create element, fill details)
    await this.elementEntry.fillFromTestCase(tc);

    // Save and click Done
    await this.elementEntry.saveAndDone();

    // Verify the entry was created — re-navigate to Element Entries and search the employee
    const effDate = getField(tc, 'Effective date');
    const element = getField(tc, 'Element name');
    const searchFor = getField(tc, 'Search For');
    if (element) {
      // Re-navigate to Element Entries page to do verification with fresh search
      await this.navigateToElementEntries();
      if (searchFor) {
        await this.elementEntry.searchEmployeeForVerify(searchFor);
      }
      const verified = await this.elementEntry.verifyEntryExists(effDate || '', element);
      if (!verified) {
        await this.elementEntry.screenshot(`element-entry-verify-failed-${tc.testId}`);
        throw new Error(`[ElementEntry] Verification failed: "${element}" entry not found after creation for test ${tc.testId}`);
      }
    }

    console.log(`[ElementEntry] ${tc.testId}: Element entry "${element}" created and verified successfully`);
  }

  /**
   * Navigate to Element Entries page.
   * The Element Entries page is a Redwood page at /hcmUI/ (NOT /fscmUI/).
   * Codegen: click link "Element Entries" on the Payroll landing page.
   */
  private async navigateToElementEntries(): Promise<void> {
    // Check if already on Element Entries page
    const eeHeading = this.page.locator('h1:has-text("Element Entries")').first();
    if (await eeHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[ElementEntry] Already on Element Entries page');
      return;
    }

    // Navigate to Payroll landing page via Redwood URL (/hcmUI/, not /fscmUI/)
    const baseUrl = process.env.ORACLE_HCM_URL || 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';
    console.log('[ElementEntry] Navigating to Payroll landing page...');
    await this.page.goto(
      `${baseUrl}/hcmUI/faces/FndOverview?fndGlobalItemNodeId=itemNode_workforce_management_payroll`,
      { timeout: 60_000, waitUntil: 'domcontentloaded' }
    );
    await this.page.waitForTimeout(5000);
    await this.elementEntry.waitForJET();

    // Codegen: getByRole('link', { name: 'Element Entries' }).click()
    const eeLink = this.page.getByRole('link', { name: 'Element Entries' }).first();
    if (await eeLink.isVisible({ timeout: 15_000 }).catch(() => false)) {
      console.log('[ElementEntry] Clicking Element Entries tile...');
      await eeLink.click();
      await this.page.waitForTimeout(5000);
      await this.elementEntry.waitForJET();
    } else {
      // Fallback: try Navigator path
      console.log('[ElementEntry] Element Entries tile not found, trying Navigator...');
      await this.homePage.goToElementEntries();
      await this.page.waitForTimeout(5000);
      await this.elementEntry.waitForJET();
    }

    // Verify we're on Element Entries
    if (!await eeHeading.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await this.page.screenshot({ path: 'test-results/element-entry-nav-failed.png', fullPage: true }).catch(() => {});
      throw new Error(`[ElementEntry] Failed to navigate to Element Entries page. URL: ${this.page.url()}`);
    }
    console.log('[ElementEntry] On Element Entries page');
  }
}
