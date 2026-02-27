import { type Page } from '@playwright/test';
import { BaseCoreHRFlow } from './base-core-hr.flow';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Flow: Assignment Change / Transfer
 * Tab: "Core - Assign Change/XFR"
 * Searches for a person, then applies assignment changes.
 */
export class AssignmentChangeFlow extends BaseCoreHRFlow {
  constructor(page: Page) {
    super(page);
  }

  async execute(tc: TestCase): Promise<void> {
    await this.setup();

    // TODO: Navigate to person's assignment record
    // This tab uses "When - Effective date" instead of "When"
    const effectiveDate = getField(tc, 'When - Effective date');
    const action = getField(tc, "What's the way");
    const reason = getField(tc, 'Why');

    // Fill effective date
    if (effectiveDate) {
      const dateStr = excelSerialToDate(effectiveDate);
      const dateInput = this.page.locator('input[aria-label*="Effective"], input[id*="EffectiveDate"]').first();
      await dateInput.clear();
      await dateInput.fill(dateStr);
      await dateInput.press('Tab');
      await this.person.waitForJET();
    }

    // Select action and reason
    await this.whenAndWhy.fillFromTestCase(tc);

    // Apply assignment changes
    await this.assignment.fillFromTestCase(tc);

    await this.submitAndVerify();
  }
}
