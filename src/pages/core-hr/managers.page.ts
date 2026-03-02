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
  private readonly managerName = this.page.locator('[id$="ManagerNameId::content"]').first();
  // Manager Name LOV search icon (magnifier button)
  private readonly managerNameSearch = this.page.locator('[id$="ManagerNameId::lovIconId"]').first();
  // Manager Type — readonly combobox, defaults to "Line manager"
  private readonly managerType = this.page.locator('[id$="selectOneChoice1::content"]').last();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const mgr = this.getManagerName(tc);
    const mgrType = getField(tc, 'Manager Type');

    if (!mgr && !mgrType) return;

    // Expand "Manager Details" section if collapsed (ADF showDetailHeader with "+" disclosure)
    const managerVisible = await this.managerName.isVisible({ timeout: 3000 }).catch(() => false);
    if (!managerVisible) {
      console.log('[Manager] Manager Name not visible, expanding section...');

      // Scroll to Manager Details header
      const header = this.page.getByText('Manager Details').first();
      await header.scrollIntoViewIfNeeded().catch(() => {});
      await this.page.waitForTimeout(1000);

      // Click the header text itself — ADF showDetailHeader toggles on text click
      await header.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(3000);
      await this.waitForJET();

      // Check if it expanded
      const nowVisible = await this.managerName.isVisible({ timeout: 3000 }).catch(() => false);
      if (!nowVisible) {
        // Try clicking via JavaScript — find the disclosure anchor near the header
        console.log('[Manager] Text click did not expand, trying JS click...');
        await this.page.evaluate(() => {
          // Find all links/anchors on the page that are disclosure toggles
          const spans = document.querySelectorAll('span, a');
          for (const el of Array.from(spans)) {
            const text = el.textContent?.trim() || '';
            if (text === 'Manager Details' || text === 'Manager\nDetails') {
              // Click the element and its parent
              (el as HTMLElement).click();
              (el.parentElement as HTMLElement)?.click();
              return;
            }
          }
        });
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }

    if (mgr) {
      await this.fillManagerName(mgr);
    }

    if (mgrType) {
      // Manager Type is typically readonly with "Line manager" default
      // Skip if field not present (e.g. non-worker Create Work Relationship wizard)
      const mgrTypeVisible = await this.managerType.isVisible({ timeout: 3000 }).catch(() => false);
      if (!mgrTypeVisible) {
        console.log('[Managers] Manager Type field not visible — skipping');
      } else {
      const isReadonly = await this.managerType.getAttribute('readonly', { timeout: 5000 }).catch(() => null);
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
              if (!comp) return;
              // Match by label first, then set by internal value
              const items = comp.getSelectItems?.();
              if (items) {
                for (let i = 0; i < items.length; i++) {
                  if (items[i].getLabel?.() === val || items[i].getValue?.() === val) {
                    comp.setValue(items[i].getValue());
                    return;
                  }
                }
              }
              comp.setValue(val);
            }, { pid: parentId, val: mgrType });
            await this.page.waitForTimeout(2000);
          }
        }
      } else {
        await this.fillCombobox(this.managerType, mgrType);
      }
      } // end else (mgrTypeVisible)
    }
  }

  /**
   * Fill Manager Name via the LOV field.
   * Oracle HCM person LOV fields accept "Last Name, First Name" format.
   * Strategy: try "Last, First" via fillLovField, if that fails try search icon.
   */
  private async fillManagerName(name: string): Promise<void> {
    // Skip if already set
    const current = await this.managerName.inputValue().catch(() => '');
    if (current && current.toLowerCase().includes(name.split(/\s+/).pop()!.toLowerCase())) return;

    // Convert "First Last" to "Last, First" format for Oracle HCM person LOV
    const parts = name.trim().split(/\s+/);
    const searchName = parts.length > 1
      ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
      : name;

    console.log(`[Manager] Filling Name: "${name}" → searching as "${searchName}"`);

    // Ensure Manager Name field is scrolled into view
    await this.managerName.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(500);

    // Try fillLovField with "Last, First" format
    await this.fillLovField(this.managerName, searchName, name);

    // Check if it worked
    let afterValue = await this.managerName.inputValue().catch(() => '');
    if (afterValue) {
      console.log(`[Manager] Name set to: "${afterValue}"`);
      return;
    }

    // Fallback: try clicking the search icon to open LOV dialog
    console.log('[Manager] fillLovField failed, trying search icon...');
    const searchIconVisible = await this.managerNameSearch.isVisible({ timeout: 3000 }).catch(() => false);
    if (searchIconVisible) {
      // Type just the last name, then click search icon
      await this.managerName.click();
      await this.managerName.fill(parts[parts.length - 1]);
      await this.page.waitForTimeout(500);
      await this.managerNameSearch.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();

      // Handle dialog — remove glass pane first so normal clicks work with ADF events
      const glassPane = this.page.locator('div.AFModalGlassPane');
      const hasDialog = await glassPane.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasDialog) {
        await this.page.waitForTimeout(2000);
        await this.clearGlassPane();
        const dialogLayer = this.page.locator('#DhtmlZOrderManagerLayerContainer');

        const resultRows = dialogLayer.locator('[_afrrk]');
        let rowCount = await resultRows.count();

        if (rowCount === 0) {
          const searchBtn = dialogLayer.getByRole('button', { name: /search/i }).first();
          const searchVisible = await searchBtn.isVisible({ timeout: 3000 }).catch(() => false);
          if (searchVisible) {
            await searchBtn.click();
            await this.page.waitForTimeout(5000);
            await this.waitForJET();
            await this.clearGlassPane();
            rowCount = await resultRows.count();
          }
        }

        if (rowCount > 0) {
          if (rowCount > 1) {
            const matchRow = dialogLayer.locator(`[_afrrk]:has-text("${name}")`).first();
            const vis = await matchRow.isVisible({ timeout: 2000 }).catch(() => false);
            if (vis) await matchRow.click();
            else await resultRows.first().click();
          } else {
            await resultRows.first().click();
          }
          await this.page.waitForTimeout(1000);
        }

        await this.clearGlassPane();
        const okBtn = dialogLayer.getByRole('button', { name: 'OK' }).first();
        const okVis = await okBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (okVis) {
          await okBtn.click();
        } else {
          const cancelBtn = dialogLayer.getByRole('button', { name: 'Cancel' }).first();
          await cancelBtn.click().catch(() => {});
        }

        await this.page.waitForTimeout(3000);
        await this.clearGlassPane();
        await this.waitForJET();
      }
    }

    afterValue = await this.managerName.inputValue().catch(() => '');
    console.log(`[Manager] Name final value: "${afterValue}"`);
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
