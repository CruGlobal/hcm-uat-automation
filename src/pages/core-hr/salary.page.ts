import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Salary section — may appear as part of Employment Information step or
 * as a separate section depending on the form.
 *
 * Fields: Salary Basis (combobox) and Salary Amount (input).
 * The salary section may not appear until after assignment fields are filled.
 */
export class SalaryPage extends BasePage {
  // These selectors try multiple patterns since salary may appear in different contexts
  private readonly salaryBasis = this.page.locator('[id*="SalaryBasis"], [id*="salaryBasis"], input[aria-label*="Salary Basis"]').first();
  private readonly salaryAmount = this.page.locator('[id*="SalaryAmount"], [id*="salaryAmount"], input[aria-label*="Amount"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const basis = getField(tc, 'Salary Basis');
    const amount = this.getSalaryAmount(tc);

    if (basis) {
      const basisVisible = await this.salaryBasis.isVisible({ timeout: 5000 }).catch(() => false);
      if (basisVisible) {
        const isReadonly = await this.salaryBasis.getAttribute('readonly');
        if (isReadonly !== null) {
          // Readonly — use ADF setValue
          const fieldId = await this.salaryBasis.getAttribute('id');
          if (fieldId) {
            const parentId = fieldId.replace('::content', '');
            await this.page.evaluate(({ pid, val }: { pid: string; val: string }) => {
              const adfPage = (window as any).AdfPage?.PAGE;
              if (!adfPage) return;
              const comp = adfPage.findComponentByAbsoluteId(pid);
              if (comp && comp.setValue) comp.setValue(val);
            }, { pid: parentId, val: basis });
            await this.page.waitForTimeout(2000);
          }
        } else {
          await this.fillCombobox(this.salaryBasis, basis);
        }
      }
    }

    if (amount) {
      const amountVisible = await this.salaryAmount.isVisible({ timeout: 5000 }).catch(() => false);
      if (amountVisible) {
        await this.fillField(this.salaryAmount, amount);
      }
    }
  }

  /** Get salary amount specifically (not salary basis). */
  private getSalaryAmount(tc: TestCase): string {
    for (const [key, val] of Object.entries(tc.fields)) {
      const lower = key.toLowerCase();
      if (lower.endsWith('> salary') || lower === 'salary') return val;
    }
    return '';
  }
}
