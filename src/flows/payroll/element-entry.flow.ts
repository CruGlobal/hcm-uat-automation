import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { ElementEntryPage } from '../../pages/payroll/element-entry.page';
import { ConfirmationPage } from '../../pages/core-hr/confirmation.page';
import type { TestCase } from '../../data/types';

/**
 * Flow: Payroll Element Entry
 * Tab: "Payroll"
 * Creates element entries (Bonus, allowances, etc.) for employees.
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
    await this.loginAndNavigate('Payroll');

    // TODO: Navigate to Element Entries page within Payroll module

    await this.elementEntry.fillFromTestCase(tc);
    await this.elementEntry.clickCreate();
    await this.confirmation.expectSuccess();
  }
}
