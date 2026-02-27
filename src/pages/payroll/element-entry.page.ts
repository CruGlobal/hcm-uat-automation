import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Element Entry page — payroll element entry management.
 *
 * The Element Entries page is a Redwood-style page in Oracle HCM.
 * Selectors here are best-guess patterns and will need refinement
 * after inspecting the live page.
 */
export class ElementEntryPage extends BasePage {
  // Search for employee
  private readonly searchFor = this.page.locator(
    'input[aria-label*="Search"], input[placeholder*="Search"], [id*="PersonSearch"], [role="searchbox"]'
  ).first();

  // Effective date
  private readonly effectiveDate = this.page.locator(
    'input[aria-label*="Effective"], input[id*="EffectiveDate"], input[id*="effectiveDate"]'
  ).first();

  // Element name (LOV or dropdown)
  private readonly elementName = this.page.locator(
    'input[aria-label*="Element"], select[aria-label*="Element"], [id*="ElementName"], [id*="elementName"]'
  ).first();

  // Separate Tax Code
  private readonly separateTaxCode = this.page.locator(
    'select[aria-label*="Separate Tax"], [id*="SeparateTaxCode"], [id*="separateTax"]'
  ).first();

  // Reason field
  private readonly reason = this.page.locator(
    'input[aria-label*="Reason"], textarea[aria-label*="Reason"], [id*="Reason"]'
  ).first();

  // Amount
  private readonly amount = this.page.locator(
    'input[aria-label*="Amount"], [id*="Amount"], [id*="amount"]'
  ).first();

  // Create / Submit button
  private readonly createButton = this.page.locator(
    'button:has-text("Create"), button:has-text("Submit"), [id*="Create"]'
  ).first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const searchFor = getField(tc, 'Search For');
    const effDate = getField(tc, 'Effective date');
    const element = getField(tc, 'Element name');
    const taxCode = getField(tc, 'Separate Tax Code');
    const reasonVal = getField(tc, 'Reason');
    const amountVal = getField(tc, 'Amount');

    // Search for employee first
    if (searchFor) {
      await this.fillField(this.searchFor, searchFor);
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      // Click first search result if visible
      const firstResult = this.page.locator(
        '[role="option"]:first-child, [role="row"]:first-child a, [class*="result"] a'
      ).first();
      if (await firstResult.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstResult.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }

    if (effDate) {
      const dateStr = excelSerialToDate(effDate);
      await this.fillField(this.effectiveDate, dateStr);
    }

    if (element) await this.fillCombobox(this.elementName, element);
    if (taxCode) await this.fillCombobox(this.separateTaxCode, taxCode);
    if (reasonVal) await this.fillField(this.reason, reasonVal);
    if (amountVal) await this.fillField(this.amount, amountVal);
  }

  async clickCreate(): Promise<void> {
    const isVisible = await this.createButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await this.createButton.click();
      await this.page.waitForTimeout(10000);
      await this.waitForJET();
    } else {
      // Try ADF button approach
      await this.clickAdfButton('Submit');
    }
  }
}
