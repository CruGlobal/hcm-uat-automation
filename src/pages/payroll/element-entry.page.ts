import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Element Entry page — payroll element entry management.
 */
export class ElementEntryPage extends BasePage {
  private readonly searchFor = this.page.locator('input[aria-label*="Search"], input[placeholder*="Search"], [id*="PersonSearch"]').first();
  private readonly effectiveDate = this.page.locator('input[aria-label*="Effective"], input[id*="EffectiveDate"]').first();
  private readonly elementName = this.page.locator('input[aria-label*="Element"], select[aria-label*="Element"], [id*="ElementName"]').first();
  private readonly separateTaxCode = this.page.locator('select[aria-label*="Separate Tax"], [id*="SeparateTaxCode"]').first();
  private readonly reason = this.page.locator('input[aria-label*="Reason"], [id*="Reason"]').first();
  private readonly amount = this.page.locator('input[aria-label*="Amount"], [id*="Amount"]').first();
  private readonly overrideCheckbox = this.page.locator('input[type="checkbox"][aria-label*="Override"], [id*="OverrideEntry"]').first();
  private readonly createButton = this.page.locator('button:has-text("Create"), [id*="Create"]').first();
  private readonly assignmentDropdown = this.page.locator('select[aria-label*="Assignment"], [id*="Assignment"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const searchFor = getField(tc, 'Search For');
    const effDate = getField(tc, 'Effective date');
    const element = getField(tc, 'Element name');
    const taxCode = getField(tc, 'Separate Tax Code');
    const reason = getField(tc, 'Reason');
    const amount = getField(tc, 'Amount');
    const override = getField(tc, 'Override Entry');
    const assignment = getField(tc, 'Assignment');

    if (searchFor) {
      await this.searchFor.clear();
      await this.searchFor.fill(searchFor);
      await this.searchFor.press('Enter');
      await this.waitForReady();
    }

    if (effDate) {
      const dateStr = excelSerialToDate(effDate);
      await this.fillInput(this.effectiveDate, dateStr);
    }

    if (element) await this.fillInput(this.elementName, element);
    if (taxCode) await this.selectValue(this.separateTaxCode, taxCode);
    if (reason) await this.fillInput(this.reason, reason);
    if (amount) await this.fillInput(this.amount, amount);
    if (assignment) await this.selectValue(this.assignmentDropdown, assignment);

    if (override && override.toLowerCase() === 'y') {
      const checked = await this.overrideCheckbox.isChecked();
      if (!checked) await this.overrideCheckbox.check();
    }
  }

  async clickCreate(): Promise<void> {
    await this.createButton.click();
    await this.waitForReady();
  }

  private async selectValue(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.click();
    await this.page.locator(`oj-option:has-text("${value}"), li[role="option"]:has-text("${value}")`).first().click();
    await this.waitForJET();
  }

  private async fillInput(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
    await locator.press('Tab');
    await this.waitForJET();
  }
}
