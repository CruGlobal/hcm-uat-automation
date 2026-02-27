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
  // Confirmation message — appears after successful submission.
  // Oracle HCM may show this as a dialog, overlay, or inline message.
  private readonly confirmationMessage = this.page.locator(
    '.af_dialog_content, [class*="confirmation"], [class*="FndOverlayBody"], .oj-message-summary, [class*="AFNote"], [id*="confirmDialog"]'
  ).first();

  // Warning/info messages that may appear
  private readonly warningMessages = this.page.locator('.oj-message-body, [class*="warning"], [class*="AFNote"]');

  // Person number in confirmation
  private readonly personNumberText = this.page.locator('text=/\\d{8,}/').first();

  async clickSubmit(): Promise<void> {
    // Try ADF button first (a[role="button"]), fall back to regular button click
    try {
      await this.clickAdfButton('Submit');
    } catch {
      const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
      await submitBtn.click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Handle "Do you want to continue?" confirmation dialog
    const yesButton = this.page.getByRole('button', { name: 'Yes' }).first();
    const hasConfirmDialog = await yesButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasConfirmDialog) {
      console.log('[Submit] Clicking Yes on confirmation dialog');
      await yesButton.click();
      await this.page.waitForTimeout(15000); // Wait for server-side processing
      await this.waitForJET();
    } else {
      // No dialog — wait for regular submission
      await this.page.waitForTimeout(10000);
      await this.waitForJET();
    }
  }

  async expectSuccess(): Promise<void> {
    // Check for error dialog first
    const errorDialog = this.page.locator('.af_dialog_content, [id*="msgDlg"], .x24d').first();
    const errorVisible = await errorDialog.isVisible({ timeout: 5000 }).catch(() => false);
    if (errorVisible) {
      const errorText = await errorDialog.textContent().catch(() => '') || '';
      // If it contains "Error" or "required", this is a validation failure
      if (errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('required')) {
        throw new Error(`Submission failed with validation errors: ${errorText.substring(0, 500)}`);
      }
    }

    // Wait for confirmation/success message
    await expect(this.confirmationMessage, 'Expected confirmation/success message to appear after submission')
      .toBeVisible({ timeout: 30_000 });

    const text = await this.confirmationMessage.textContent() || '';
    console.log('Confirmation:', text.substring(0, 200));

    // Log warning/error messages for debugging
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
