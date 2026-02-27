import { type Page, type Locator, expect } from '@playwright/test';
import { waitForOracleJET, waitForPageReady, dismissPopups } from '../utils/oracle-hcm-helpers';

/**
 * Base page object for all Oracle HCM pages.
 * Provides common waits, popup dismissal, and navigation helpers.
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

  /** Click an element and wait for JET. */
  async clickAndWait(selector: string): Promise<void> {
    await this.page.locator(selector).click();
    await this.waitForJET();
  }

  /** Fill an input and optionally trigger JET update. */
  async fillField(selector: string, value: string): Promise<void> {
    const field = this.page.locator(selector);
    await field.clear();
    await field.fill(value);
    await field.press('Tab'); // trigger JET validation
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
