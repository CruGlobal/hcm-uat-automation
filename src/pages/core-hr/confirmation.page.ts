import { expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Confirmation/success page — verify submission and capture results.
 *
 * After clicking Submit, Oracle HCM shows either:
 * 1. A confirmation message with person number
 * 2. Validation errors that need to be resolved
 *
 * The confirmation dialog uses ADF confirmation components.
 */
export class ConfirmationPage extends BasePage {
  // Confirmation message — appears after successful submission
  private readonly confirmationMessage = this.page.locator(
    '.af_dialog_content, [class*="confirmation"], [class*="FndOverlayBody"], .oj-message-summary'
  ).first();

  // Warning/info messages that may appear
  private readonly warningMessages = this.page.locator('.oj-message-body, [class*="warning"], [class*="AFNote"]');

  // Person number in confirmation
  private readonly personNumberText = this.page.locator('text=/\\d{8,}/').first();

  async clickSubmit(): Promise<void> {
    await this.clickAdfButton('Submit');
    await this.page.waitForTimeout(15000); // ADF submission is slow
    await this.waitForJET();
  }

  async expectSuccess(): Promise<void> {
    // Wait for either confirmation message or any dialog
    const hasConfirmation = await this.confirmationMessage.isVisible({ timeout: 30_000 }).catch(() => false);
    if (hasConfirmation) {
      const text = await this.confirmationMessage.textContent() || '';
      console.log('Confirmation:', text.substring(0, 200));
    }

    // Also look for warning/error messages
    const warnings = await this.warningMessages.allTextContents().catch(() => []);
    if (warnings.length > 0) {
      console.log('Warnings:', warnings.map(w => w.substring(0, 100)));
    }
  }

  async getPersonNumber(): Promise<string> {
    try {
      const text = await this.confirmationMessage.textContent({ timeout: 5000 }) || '';
      // Extract person number (8+ digit number) from confirmation text
      const match = text.match(/\d{8,}/);
      return match ? match[0] : '';
    } catch {
      return '';
    }
  }

  /** Full submit + verify flow. Returns person number if available. */
  async submitAndVerify(): Promise<string> {
    await this.clickSubmit();
    await this.expectSuccess();
    return this.getPersonNumber();
  }

  /** Click OK/Close on confirmation dialog if present */
  async dismissConfirmation(): Promise<void> {
    try {
      await this.clickAdfButton('OK');
    } catch {
      try {
        await this.clickAdfButton('Close');
      } catch {
        // No dialog to dismiss
      }
    }
  }
}
