import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Managers section — manager search and type.
 */
export class ManagersPage extends BasePage {
  private readonly managerSearch = this.page.locator('input[aria-label*="Manager"], input[id*="ManagerName"]').first();
  private readonly managerType = this.page.locator('select[aria-label*="Manager Type"], [id*="ManagerType"]').first();

  async fillFromTestCase(tc: TestCase): Promise<void> {
    const manager = getField(tc, 'Manager');
    const managerType = getField(tc, 'Manager Type');

    // "Manager" partial matches both — get them specifically
    const mgr = this.getManagerName(tc);

    if (mgr) {
      await this.managerSearch.clear();
      await this.managerSearch.fill(mgr);
      await this.managerSearch.press('Tab');
      await this.waitForJET();
      // Select from search results if a dropdown appears
      const option = this.page.locator(`li[role="option"]:has-text("${mgr}")`).first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.click();
        await this.waitForJET();
      }
    }

    if (managerType) {
      await this.managerType.click();
      await this.page.locator(`oj-option:has-text("${managerType}"), li[role="option"]:has-text("${managerType}")`).first().click();
      await this.waitForJET();
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
