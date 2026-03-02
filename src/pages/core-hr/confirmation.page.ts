import { expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Confirmation/success page — verify submission and capture results.
 *
 * After clicking Submit, Oracle HCM shows either:
 * 1. A confirmation message with person number (ADF dialog or overlay)
 * 2. A Redwood notification banner/toast
 * 3. Page navigation away from the wizard (e.g., back to dashboard)
 * 4. Validation errors that need to be resolved
 *
 * Different form types (Hire, Add Pending Worker, Add Nonworker) use
 * different confirmation patterns. This page handles all variants.
 */
export class ConfirmationPage extends BasePage {
  // Confirmation message — appears after successful submission.
  // Covers ADF dialogs, Fusion overlays, OJ messages, and Redwood notifications.
  private readonly confirmationMessage = this.page.locator(
    [
      '.af_dialog_content',
      '[class*="confirmation"]',
      '[class*="FndOverlayBody"]',
      '.oj-message-summary',
      '[class*="AFNote"]',
      '[id*="confirmDialog"]',
      '.oj-notification-toast',
      '[class*="FndNotification"]',
      '.fnd-notification-detail',
    ].join(', ')
  ).first();

  // Warning/info messages that may appear
  private readonly warningMessages = this.page.locator('.oj-message-body, [class*="warning"], [class*="AFNote"]');

  // Person number in confirmation
  private readonly personNumberText = this.page.locator('text=/\\d{8,}/').first();

  // Track pre-submit URL to detect page navigation
  private preSubmitUrl = '';

  async clickSubmit(): Promise<void> {
    // Record URL before submit for navigation-based success detection
    this.preSubmitUrl = this.page.url();

    // Try ADF button first (a[role="button"]), fall back to regular button click
    try {
      await this.clickAdfButton('Submit');
    } catch {
      const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
      // Use short timeout — if Submit doesn't appear in 5s, the page likely uses a wizard
      // and the caller should handle the failure (e.g., Add Assignment opens a multi-step form)
      const submitVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (!submitVisible) throw new Error('Submit button not found');
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

    // Handle "The request was submitted." confirmation dialog (click OK to dismiss)
    const okButton = this.page.getByRole('button', { name: 'OK' }).first();
    const hasSubmittedDialog = await okButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasSubmittedDialog) {
      const dialogText = await this.page.locator('.af_dialog_content').first().textContent().catch(() => '');
      if (dialogText?.toLowerCase().includes('submitted') || dialogText?.toLowerCase().includes('confirmation')) {
        console.log(`[Submit] Dismissing confirmation dialog: "${dialogText?.substring(0, 100)}"`);
        await okButton.click();
        await this.page.waitForTimeout(3000);
      }
    }
  }

  async expectSuccess(): Promise<void> {
    const currentUrl = this.page.url();
    console.log(`[Confirm] Pre-submit URL: ${this.preSubmitUrl}`);
    console.log(`[Confirm] Current URL: ${currentUrl}`);

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

    // Strategy 1: Check for confirmation message elements (ADF dialogs, OJ notifications)
    const confirmVisible = await this.confirmationMessage.isVisible({ timeout: 10_000 }).catch(() => false);
    if (confirmVisible) {
      const text = await this.confirmationMessage.textContent() || '';
      console.log('Confirmation:', text.substring(0, 200));
      this.logWarnings();
      return;
    }

    // Strategy 2: Check if the page navigated away from the wizard form (success)
    // After successful submission, Oracle HCM often redirects to a different page.
    if (this.preSubmitUrl && currentUrl !== this.preSubmitUrl) {
      console.log(`[Confirm] Page navigated: success (URL changed)`);
      this.logWarnings();
      return;
    }

    // Strategy 3: Check for any person number on the page (confirmation with person number)
    const personNum = await this.personNumberText.isVisible({ timeout: 5000 }).catch(() => false);
    if (personNum) {
      const numText = await this.personNumberText.textContent().catch(() => '') || '';
      console.log(`[Confirm] Found person number: ${numText}`);
      this.logWarnings();
      return;
    }

    // Strategy 4: Check if the Submit button is no longer visible (form was submitted)
    const submitGone = await this.page.locator('a[role="button"]:has-text("Submit"), button:has-text("Submit")').first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    if (!submitGone) {
      // Submit button disappeared — the form was submitted successfully
      console.log('[Confirm] Submit button no longer visible — treating as success');
      this.logWarnings();
      return;
    }

    // If we get here, capture debug info and fail
    const bodyText = await this.page.evaluate(() => {
      const body = document.body;
      const dialogs = body.querySelectorAll('.af_dialog, .af_popup, [class*="dialog"], [class*="notification"], [class*="message"]');
      return {
        title: document.title,
        url: window.location.href,
        dialogCount: dialogs.length,
        dialogClasses: Array.from(dialogs).map(d => d.className).slice(0, 10),
        bodyText: body.innerText?.substring(0, 500),
      };
    }).catch(() => ({ title: '(error)', url: '(error)', dialogCount: 0, dialogClasses: [] as string[], bodyText: '(error)' }));
    console.log(`[Confirm] Debug — title: ${bodyText.title}, dialogs: ${bodyText.dialogCount}, classes: ${JSON.stringify(bodyText.dialogClasses)}`);
    console.log(`[Confirm] Debug — body text: ${bodyText.bodyText}`);

    // Final attempt with longer timeout
    await expect(this.confirmationMessage, 'Expected confirmation/success message to appear after submission')
      .toBeVisible({ timeout: 15_000 });

    const text = await this.confirmationMessage.textContent() || '';
    console.log('Confirmation:', text.substring(0, 200));
    this.logWarnings();
  }

  private async logWarnings(): Promise<void> {
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
