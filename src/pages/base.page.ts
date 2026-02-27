import { type Page, type Locator, expect } from '@playwright/test';
import { waitForOracleJET, waitForPageReady, dismissPopups } from '../utils/oracle-hcm-helpers';

/**
 * Base page object for all Oracle HCM pages.
 * Provides common waits, popup dismissal, ADF interaction helpers, and navigation.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /** Wait for Oracle JET to finish processing. */
  async waitForJET(timeout?: number): Promise<void> {
    await waitForOracleJET(this.page, timeout);
  }

  /** Wait for full page readiness (network idle + JET). */
  async waitForReady(): Promise<void> {
    await waitForPageReady(this.page);
  }

  /** Dismiss any notification popups or walkme guides. */
  async dismissPopups(): Promise<void> {
    await dismissPopups(this.page);
  }

  /** Navigate to a URL path relative to base URL. */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.waitForReady();
    await this.dismissPopups();
  }

  /** Fill an input field, Tab to trigger validation, and wait for JET. */
  async fillField(locator: Locator | string, value: string): Promise<void> {
    const field = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await field.clear();
    await field.fill(value);
    await field.press('Tab');
    await this.waitForJET();
  }

  /**
   * Fill an Oracle ADF combobox (LOV autocomplete).
   * Types the value then presses Tab to trigger autocomplete selection.
   * After selection, waits for potential partial page refresh.
   */
  async fillCombobox(locator: Locator | string, value: string, waitAfter = 3000): Promise<void> {
    const field = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await field.click();
    await field.fill(value);
    await this.page.waitForTimeout(1500); // Wait for autocomplete suggestions
    await field.press('Tab');
    await this.page.waitForTimeout(waitAfter); // Wait for partial refresh
    await this.waitForJET();
  }

  /**
   * Click an Oracle ADF command link/button via AdfActionEvent.
   * Standard clicks don't work because Oracle ADF uses onclick="return false".
   * This queues an AdfActionEvent on the ADF component to trigger server-side action.
   */
  async clickAdfLink(componentId: string): Promise<void> {
    await this.page.evaluate((id: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) throw new Error('AdfPage.PAGE not available');
      const comp = adfPage.findComponentByAbsoluteId(id);
      if (!comp) throw new Error(`ADF component not found: ${id}`);
      const evt = new (window as any).AdfActionEvent(comp);
      evt.queue();
    }, componentId);
    await this.page.waitForTimeout(2000);
    await this.waitForJET();
  }

  /**
   * Click an ADF wizard button (Next, Back, Submit, Cancel, Save) by its visible text.
   * Walks up parent elements from the <a role="button"> to find the ADF component.
   */
  async clickAdfButton(buttonText: string): Promise<void> {
    const componentId = await this.page.evaluate((text: string) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return null;
      const links = document.querySelectorAll('a[role="button"]');
      for (const a of Array.from(links)) {
        if ((a as any).textContent?.trim() === text && (a as any).offsetWidth > 0) {
          let el: any = a;
          for (let i = 0; i < 5; i++) {
            el = el.parentElement;
            if (!el) break;
            if (el.id) {
              const comp = adfPage.findComponentByAbsoluteId(el.id);
              if (comp) return el.id;
            }
          }
        }
      }
      return null;
    }, buttonText);

    if (!componentId) throw new Error(`ADF button "${buttonText}" not found`);
    await this.clickAdfLink(componentId);
  }

  /** Click an element and wait for JET. */
  async clickAndWait(selector: string): Promise<void> {
    await this.page.locator(selector).click();
    await this.waitForJET();
  }

  /** Check that a text element is visible on the page. */
  async expectTextVisible(text: string): Promise<void> {
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible();
  }

  /** Take a screenshot with a descriptive name. */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }
}
