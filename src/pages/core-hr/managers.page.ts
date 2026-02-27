import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Manager Details section — part of Employment Information step (Step 3).
 *
 * Located under `r3:0:i1:0:` prefix in the ADF component tree.
 * Manager Name is a LOV combobox, Manager Type is readonly (defaults to "Line manager").
 */
export class ManagersPage extends BasePage {
  // Manager Name — LOV combobox (search by name)
  private readonly managerName = this.page.locator('[id$="r3:0:i1:0:ManagerNameId::content"]');
  // Manager Type — readonly combobox, defaults to "Line manager"
  private readonly managerType = this.page.locator('[id$="r3:0:i1:0:selectOneChoice1::content"]');

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const mgr = this.getManagerName(tc);
    const mgrType = getField(tc, 'Manager Type');

    if (mgr) {
      await this.fillCombobox(this.managerName, mgr);
    }

    if (mgrType) {
      // Manager Type is typically readonly with "Line manager" default
      const isReadonly = await this.managerType.getAttribute('readonly');
      if (isReadonly !== null) {
        // Already set to default — only change if different
        const currentVal = await this.managerType.inputValue().catch(() => '');
        if (currentVal.toLowerCase() !== mgrType.toLowerCase()) {
          const fieldId = await this.managerType.getAttribute('id');
          if (fieldId) {
            const parentId = fieldId.replace('::content', '');
            await this.page.evaluate(({ pid, val }: { pid: string; val: string }) => {
              const adfPage = (window as any).AdfPage?.PAGE;
              if (!adfPage) return;
              const comp = adfPage.findComponentByAbsoluteId(pid);
              if (comp && comp.setValue) comp.setValue(val);
            }, { pid: parentId, val: mgrType });
            await this.page.waitForTimeout(2000);
          }
        }
      } else {
        await this.fillCombobox(this.managerType, mgrType);
      }
    }
  }

  /** Get manager name specifically (not manager type). */
  private getManagerName(tc: TestCase): string {
    for (const [key, val] of Object.entries(tc.fields)) {
      const lower = key.toLowerCase();
      if (lower.includes('manager') && !lower.includes('type')) return val;
    }
    return '';
  }
}
