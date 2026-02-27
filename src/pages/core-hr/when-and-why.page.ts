import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * "When and Why" section — date, legal employer, action, reason, business unit.
 * Field key prefixes vary per tab ("When and Why > When", "When", "Proposed Start Date", etc.).
 */
export class WhenAndWhyPage extends BasePage {
  private readonly whenDate = this.page.locator('input[aria-label*="When"], input[aria-label*="Date"], input[id*="EffectiveDate"]').first();
  private readonly legalEmployer = this.page.locator('select[aria-label*="Legal Employer"], [id*="LegalEmployer"]').first();
  private readonly action = this.page.locator('select[aria-label*="Action"], [id*="Action"], select[aria-label*="way"]').first();
  private readonly reason = this.page.locator('select[aria-label*="Reason"], [id*="ActionReason"], select[aria-label*="Why"]').first();
  private readonly businessUnit = this.page.locator('select[aria-label*="Business Unit"], [id*="BusinessUnit"]').first();
  private readonly workerType = this.page.locator('select[aria-label*="Worker Type"], [id*="WorkerType"]').first();
  private readonly nonWorkerType = this.page.locator('select[aria-label*="Non Worker Type"], [id*="NonWorkerType"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    // Date — various field names across tabs
    const when = getField(tc, 'When') || getField(tc, 'Proposed Start Date') || getField(tc, 'Effective date');
    const legalEmployer = getField(tc, 'Legal Employer');
    const action = getField(tc, "What's the way") || getField(tc, 'What');
    const reason = getField(tc, 'Why');
    const bu = getField(tc, 'Business Unit');
    const workerType = getField(tc, 'Worker Type') || getField(tc, 'Proposed Worker type');
    const nonWorkerType = getField(tc, 'Non Worker Type');

    if (when) await this.fillDate(when);
    if (legalEmployer) await this.selectValue(this.legalEmployer, legalEmployer);
    if (action) await this.selectValue(this.action, action);
    if (reason) await this.selectValue(this.reason, reason);
    if (bu) await this.selectValue(this.businessUnit, bu);
    if (workerType) await this.selectValue(this.workerType, workerType);
    if (nonWorkerType) await this.selectValue(this.nonWorkerType, nonWorkerType);
  }

  private async fillDate(serial: string): Promise<void> {
    const dateStr = excelSerialToDate(serial);
    await this.whenDate.clear();
    await this.whenDate.fill(dateStr);
    await this.whenDate.press('Tab');
    await this.waitForJET();
  }

  private async selectValue(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.click();
    await this.page.locator(`oj-option:has-text("${value}"), li[role="option"]:has-text("${value}")`).first().click();
    await this.waitForJET();
  }
}
