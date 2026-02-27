import { expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Confirmation/success page — verify submission and capture person number.
 */
export class ConfirmationPage extends BasePage {
  private readonly successMessage = this.page.locator('[class*="confirmation"], [class*="success"], .oj-message-summary').first();
  private readonly personNumber = this.page.locator('[id*="PersonNumber"], [aria-label*="Person Number"]').first();
  private readonly submitButton = this.page.locator('button:has-text("Submit"), [id*="Submit"]').first();

  async clickSubmit(): Promise<void> {
    await this.submitButton.click();
    await this.waitForReady();
  }

  async expectSuccess(): Promise<void> {
    await expect(this.successMessage).toBeVisible({ timeout: 30_000 });
  }

  async getPersonNumber(): Promise<string> {
    const visible = await this.personNumber.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) return '';
    return (await this.personNumber.textContent()) || '';
  }

  /** Full submit + verify flow. Returns person number if available. */
  async submitAndVerify(): Promise<string> {
    await this.clickSubmit();
    await this.expectSuccess();
    return this.getPersonNumber();
  }
}
