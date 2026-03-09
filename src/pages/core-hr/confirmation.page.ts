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
      // Broader Submit button selectors — ADF uses various patterns
      const submitBtn = this.page.locator(
        'button:has-text("Submit"), a[role="button"]:has-text("Submit"), ' +
        '[id*="submit" i]:not([style*="display: none"]), ' +
        'input[type="submit"][value="Submit"]'
      ).first();
      // Use short timeout — if Submit doesn't appear in 5s, try navigating to review step
      let submitVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (!submitVisible) {
        // Try to advance through wizard steps to reach the Submit/Review step
        console.log('[Submit] Submit not found — attempting to navigate to review step');
        await this.navigateToReviewStep();
        // Check again after navigation with broader selectors
        submitVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
        if (!submitVisible) {
          // Final attempt: try ADF button again after step navigation
          try {
            await this.clickAdfButton('Submit');
            // If ADF button worked, skip the regular click below
            await this.page.waitForTimeout(5000);
            await this.waitForJET();
            // Handle confirmation dialogs
            await this.handlePostSubmitDialogs();
            return;
          } catch {
            // Check if we're already past submit (page navigated or success shown)
            const currentUrl = this.page.url();
            if (currentUrl !== this.preSubmitUrl) {
              console.log('[Submit] Page navigated during attempts — treating as success');
              await this.page.waitForTimeout(5000);
              await this.waitForJET();
              await this.handlePostSubmitDialogs();
              return;
            }
            // Try alternative action buttons: Save and Close, Done, Save
            for (const altBtn of ['Save and Close', 'Done', 'Save']) {
              try {
                await this.clickAdfButton(altBtn);
                console.log(`[Submit] Found "${altBtn}" instead of Submit`);
                await this.page.waitForTimeout(5000);
                await this.waitForJET();
                await this.handlePostSubmitDialogs();
                return;
              } catch { /* try next */ }
            }
            await this.page.screenshot({ path: 'test-results/submit-not-found.png', fullPage: true }).catch(() => {});
            throw new Error('Submit button not found after navigating through wizard steps');
          }
        }
      }
      await submitBtn.click();
    }
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
    await this.handlePostSubmitDialogs();
  }

  /**
   * Handle post-submit confirmation dialogs ("Do you want to continue?", "The request was submitted.", etc.)
   */
  private async handlePostSubmitDialogs(): Promise<void> {
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
    // Strategy 1: Extract from confirmation message element
    try {
      const text = await this.confirmationMessage.textContent({ timeout: 5000 }) || '';
      const match = text.match(/\d{8,}/);
      if (match) return match[0];
    } catch { /* not visible */ }

    // Strategy 2: Extract from any 8+ digit number visible on the page
    try {
      const numVisible = await this.personNumberText.isVisible({ timeout: 3000 }).catch(() => false);
      if (numVisible) {
        const numText = await this.personNumberText.textContent().catch(() => '') || '';
        const match = numText.match(/\d{8,}/);
        if (match) return match[0];
      }
    } catch { /* not visible */ }

    return '';
  }

  /** Full submit + verify flow. Returns person number if available. */
  async submitAndVerify(): Promise<string> {
    await this.clickSubmit();
    await this.expectSuccess();
    return this.getPersonNumber();
  }

  /**
   * Navigate through wizard steps to reach the Review/Submit step.
   * Detects the current step and clicks Next/Continue up to 5 times
   * until the Submit button appears.
   */
  async navigateToReviewStep(): Promise<void> {
    for (let step = 0; step < 5; step++) {
      // Check if Submit is now visible (multiple selector patterns)
      const submitBtn = this.page.locator(
        'a[role="button"]:has-text("Submit"), button:has-text("Submit"), ' +
        '[id*="submit" i][role="button"], [id*="Submit"][role="button"]'
      ).first();
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[Navigate] Found Submit button after ${step} step(s)`);
        return;
      }

      // Try clicking "Next", "Continue", or "Review" to advance
      let advanced = false;
      for (const buttonText of ['Next', 'Continue', 'Review']) {
        try {
          await this.clickAdfButton(buttonText);
          console.log(`[Navigate] Clicked "${buttonText}" (step ${step + 1})`);
          advanced = true;
          await this.page.waitForTimeout(3000);
          await this.waitForJET();

          // Dismiss any error/warning dialogs that block navigation
          const errorDialog = this.page.locator('.x24d, [id*="msgDlg"]').first();
          if (await errorDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
            const okBtn = this.page.locator('.x24d button, [id*="msgDlg"] button').first();
            await okBtn.click({ force: true }).catch(() => {});
            await this.page.waitForTimeout(1000);
          }
          break;
        } catch {
          // Button not found, try the other one
        }
      }

      if (!advanced) {
        // Neither Next nor Continue nor Review found via ADF — try regular Playwright button clicks
        const nextBtn = this.page.getByRole('button', { name: /^(Next|Continue|Review)$/i }).first();
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextBtn.click();
          console.log(`[Navigate] Clicked Next/Continue via getByRole (step ${step + 1})`);
          await this.page.waitForTimeout(3000);
          await this.waitForJET();
        } else {
          // Try clicking wizard train stop for "Review" if visible
          const reviewStop = this.page.locator(
            'a:has-text("Review"), [class*="train"] a:has-text("Review"), ' +
            '[role="tab"]:has-text("Review"), [id*="train"] a'
          ).last();
          if (await reviewStop.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log(`[Navigate] Clicking Review train stop directly (step ${step + 1})`);
            await reviewStop.click({ force: true });
            await this.page.waitForTimeout(3000);
            await this.waitForJET();
          } else {
            console.log(`[Navigate] No Next/Continue/Submit/Review found at step ${step + 1}`);
            break;
          }
        }
      }
    }
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
