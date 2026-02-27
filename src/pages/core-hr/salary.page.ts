import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Salary section — salary basis and amount.
 */
export class SalaryPage extends BasePage {
  private readonly salaryBasis = this.page.locator('select[aria-label*="Salary Basis"], input[aria-label*="Salary Basis"], [id*="SalaryBasis"]').first();
  private readonly salaryAmount = this.page.locator('input[aria-label*="Salary Amount"], input[aria-label*="Salary"], [id*="SalaryAmount"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const basis = getField(tc, 'Salary Basis');
    const amount = getField(tc, 'Salary');
    // "Salary" partial match could match "Salary Basis" too — use specific key
    const salaryAmount = this.getSalaryAmount(tc);

    if (basis) await this.fillInput(this.salaryBasis, basis);
    if (salaryAmount) await this.fillInput(this.salaryAmount, salaryAmount);
  }

  /** Get salary amount specifically (not salary basis). */
  private getSalaryAmount(tc: TestCase): string {
    // Look for exact "Salary > Salary" key or just "Salary" without "Basis"
    for (const [key, val] of Object.entries(tc.fields)) {
      const lower = key.toLowerCase();
      if (lower.endsWith('> salary') || (lower === 'salary')) return val;
    }
    return '';
  }

  private async fillInput(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
    await locator.press('Tab');
    await this.waitForJET();
  }
}
