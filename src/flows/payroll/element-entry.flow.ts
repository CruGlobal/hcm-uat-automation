import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { ElementEntryPage } from '../../pages/payroll/element-entry.page';
import { ConfirmationPage } from '../../pages/core-hr/confirmation.page';
import type { TestCase } from '../../data/types';

/**
 * Flow: Payroll Element Entry
 * Tab: "Payroll"
 *
 * Steps:
 * 1. Login to HCM
 * 2. Navigate to Element Entries page
 * 3. Search for employee
 * 4. Fill element entry details (effective date, element name, tax code, etc.)
 * 5. Submit/Create the entry
 */
export class ElementEntryFlow extends BaseFlow {
  protected elementEntry: ElementEntryPage;
  protected confirmation: ConfirmationPage;

  constructor(page: Page) {
    super(page);
    this.elementEntry = new ElementEntryPage(page);
    this.confirmation = new ConfirmationPage(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.loginToHCM();
    await this.homePage.goToElementEntries();

    await this.elementEntry.fillFromTestCase(tc);
    await this.elementEntry.clickCreate();
    await this.confirmation.expectSuccess();
  }
}
