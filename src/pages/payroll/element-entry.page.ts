import type { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Element Entry page -- payroll element entry management.
 *
 * The Element Entries page is used to create, update, and manage payroll
 * element entries for employees. It can be either a Redwood-style or ADF page
 * depending on the Oracle HCM configuration.
 *
 * Field data for 108 payroll tests follows this pattern:
 *   Search For:                        employee name (e.g., "Erin O'Grady")
 *   Effective date:                    Excel serial number (e.g., "45689")
 *   Element name:                      element type (e.g., "Housing Allowance")
 *   General Information > Separate Tax Code: tax code (e.g., "Regular")
 *   General Information > Reason:      reason text (e.g., "Migration test")
 *   Starting point:                    navigation hint (e.g., "Element Entry: Housing Allowance")
 */
export class ElementEntryPage extends BasePage {
  // Search for employee — try multiple selector patterns
  private readonly searchFor = this.page.locator(
    'input[aria-label*="Search"], input[placeholder*="Search"], ' +
    'input[role="searchbox"], input[aria-label*="Name"], ' +
    '[id*="search"] input'
  ).first();

  // Effective date
  private readonly effectiveDate = this.page.locator(
    'input[aria-label*="Effective"], input[id*="EffectiveDate"], ' +
    'input[id*="effectiveDate"], input[aria-label*="Date"]'
  ).first();

  // Element name (LOV or dropdown)
  private readonly elementName = this.page.locator(
    'input[aria-label*="Element"], select[aria-label*="Element"], ' +
    '[id*="ElementName"], [id*="elementName"]'
  ).first();

  // Separate Tax Code
  private readonly separateTaxCode = this.page.locator(
    'select[aria-label*="Separate Tax"], input[aria-label*="Separate Tax"], ' +
    '[id*="SeparateTaxCode"], [id*="separateTax"]'
  ).first();

  // Reason field
  private readonly reason = this.page.locator(
    'input[aria-label*="Reason"], textarea[aria-label*="Reason"], ' +
    '[id*="Reason"], select[aria-label*="Reason"]'
  ).first();

  // Amount
  private readonly amount = this.page.locator(
    'input[aria-label*="Amount"], [id*="Amount"], [id*="amount"]'
  ).first();

  // Create / Submit button selector candidates (checked in order by getVisibleCreateButton)
  private readonly createButtonSelectors = [
    'button:has-text("Create")',
    'a[role="button"]:has-text("Create")',
    '[id*="Create"]',
    'button:has-text("Submit")',
    'a[role="button"]:has-text("Submit")',
    'button:has-text("Save")',
  ];

  /**
   * Fill element entry form from test case field data.
   * Uses getField() for case-insensitive partial key matching against
   * the TestCase.fields map.
   */
  async fillFromTestCase(tc: TestCase): Promise<void> {
    const searchFor = getField(tc, 'Search For');
    const effDate = getField(tc, 'Effective date');
    const element = getField(tc, 'Element name');
    const taxCode = getField(tc, 'Separate Tax Code');
    const reasonVal = getField(tc, 'Reason');
    const amountVal = getField(tc, 'Amount');

    console.log(`[ElementEntry] Filling: search="${searchFor}", element="${element}", date="${effDate}"`);

    // Step 1: Search for employee
    if (searchFor) {
      await this.searchEmployee(searchFor);
    }

    // Step 2: Fill effective date (convert Excel serial if needed)
    if (effDate) {
      const dateStr = excelSerialToDate(effDate);
      console.log(`[ElementEntry] Effective date: ${effDate} -> ${dateStr}`);
      await this.fillEffectiveDate(dateStr);
    }

    // Step 3: Select element name
    if (element) {
      await this.selectElement(element);
    }

    // Step 4: Fill tax code
    if (taxCode) {
      await this.fillTaxCode(taxCode);
    }

    // Step 5: Fill reason
    if (reasonVal) {
      await this.fillReason(reasonVal);
    }

    // Step 6: Fill amount if present
    if (amountVal) {
      await this.fillAmount(amountVal);
    }
  }

  /** Search for an employee by name with multiple fallback strategies. */
  private async searchEmployee(name: string): Promise<void> {
    // Wait for page to stabilize after navigation
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForJET();

    // Strategy 1: Use Person Name combobox (ADF-style page — most common for Element Entries)
    const personField = this.page.locator(
      'input[aria-label*="Person"], input[aria-label*="Employee"], input[aria-label*="Worker"]'
    ).first();
    if (await personField.isVisible({ timeout: 8000 }).catch(() => false)) {
      await this.fillCombobox(personField, name);
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: Use the search input on the Element Entries page (Redwood)
    const searchVisible = await this.searchFor.isVisible({ timeout: 5000 }).catch(() => false);
    if (searchVisible) {
      await this.searchFor.click();
      await this.searchFor.fill(name);
      await this.page.waitForTimeout(2000);

      // Try pressing Enter or clicking search button
      const searchBtn = this.page.locator(
        'button[aria-label*="Search"], button:has-text("Search"), [role="button"][aria-label*="Search"]'
      ).first();
      if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchBtn.click();
      } else {
        await this.searchFor.press('Enter');
      }
      await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await this.waitForJET();

      // Click first search result
      await this.clickFirstSearchResult(name);
      return;
    }

    // Strategy 3: Try ADF-style search fields with common ID patterns
    const adfSearch = this.page.locator(
      '[id$="q1:value00::content"], [id*="PersonName"], [id*="personName"]'
    ).first();
    if (await adfSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
      await adfSearch.click();
      await adfSearch.fill(name);
      await adfSearch.press('Tab');
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
      return;
    }

    // No search field found — take a screenshot and throw
    await this.page.screenshot({ path: 'test-results/element-entry-no-search.png', fullPage: true }).catch(() => {});
    throw new Error(`[ElementEntry] No search field visible for employee "${name}" — may not be on Element Entries page`);
  }

  /** Click the first matching search result. */
  private async clickFirstSearchResult(name: string): Promise<void> {
    // Try multiple result selectors
    const resultSelectors = [
      `a:has-text("${name.split(' ')[0]}")`,           // Match by first name
      `[role="option"]:has-text("${name.split(' ')[0]}")`,
      '[role="option"]:first-child',
      '[role="row"]:first-child a',
      '[role="listitem"]:first-child a',
      '[class*="result"] a:first-child',
      'table tbody tr:first-child td a',
    ];

    for (const sel of resultSelectors) {
      const result = this.page.locator(sel).first();
      const visible = await result.isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        console.log(`[ElementEntry] Clicking search result: ${sel}`);
        await result.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
        return;
      }
    }

    console.log(`[ElementEntry] No search result found for "${name}"`);
  }

  /** Fill the effective date field. */
  private async fillEffectiveDate(dateStr: string): Promise<void> {
    const dateVisible = await this.effectiveDate.isVisible({ timeout: 5000 }).catch(() => false);
    if (dateVisible) {
      await this.fillField(this.effectiveDate, dateStr);
    } else {
      console.log('[ElementEntry] Effective date field not visible');
    }
  }

  /** Select an element name from the element dropdown/LOV. */
  private async selectElement(element: string): Promise<void> {
    const elementVisible = await this.elementName.isVisible({ timeout: 5000 }).catch(() => false);
    if (elementVisible) {
      await this.fillCombobox(this.elementName, element);
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    } else {
      // Try alternate selectors
      const altElement = this.page.locator(
        'input[id*="element"], select[id*="element"], input[aria-label*="Name"]'
      ).first();
      if (await altElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.fillCombobox(altElement, element);
      } else {
        console.log(`[ElementEntry] Element name field not visible`);
      }
    }
  }

  /** Fill the Separate Tax Code field. */
  private async fillTaxCode(taxCode: string): Promise<void> {
    const taxVisible = await this.separateTaxCode.isVisible({ timeout: 3000 }).catch(() => false);
    if (taxVisible) {
      await this.fillCombobox(this.separateTaxCode, taxCode);
    }
  }

  /** Fill the Reason field. */
  private async fillReason(reasonVal: string): Promise<void> {
    const reasonVisible = await this.reason.isVisible({ timeout: 3000 }).catch(() => false);
    if (reasonVisible) {
      const tagName = await this.reason.evaluate(el => el.tagName.toLowerCase()).catch(() => 'input');
      if (tagName === 'select') {
        await this.fillCombobox(this.reason, reasonVal);
      } else {
        await this.fillField(this.reason, reasonVal);
      }
    }
  }

  /** Fill the Amount field if visible. */
  private async fillAmount(amountVal: string): Promise<void> {
    const amountVisible = await this.amount.isVisible({ timeout: 3000 }).catch(() => false);
    if (amountVisible) {
      await this.fillField(this.amount, amountVal);
    }
  }

  /** Find the first visible create/submit button from selector candidates. */
  private async getVisibleCreateButton(): Promise<Locator | null> {
    for (const sel of this.createButtonSelectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        return btn;
      }
    }
    return null;
  }

  /** Click the Create/Submit button with multiple fallback strategies. */
  async clickCreate(): Promise<void> {
    await this.waitForJET();

    // Strategy 1: Find visible button from ordered selector candidates
    const visibleBtn = await this.getVisibleCreateButton();
    if (visibleBtn) {
      await visibleBtn.click();
      await this.page.waitForTimeout(10000);
      await this.waitForJET();
      return;
    }

    // Strategy 2: Try ADF button approach for each button text
    for (const text of ['Create', 'Submit', 'Save', 'OK']) {
      try {
        await this.clickAdfButton(text);
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        return;
      } catch {
        // Try next
      }
    }

    // Strategy 3: Try getByRole
    for (const name of ['Create', 'Submit', 'Save']) {
      const btn = this.page.getByRole('button', { name }).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        return;
      }
    }

    console.log('[ElementEntry] No Create/Submit button found');
  }
}
