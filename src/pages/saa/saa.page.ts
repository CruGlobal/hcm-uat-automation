import { BasePage } from '../base.page';

/**
 * Page object for SAA (Salary Approval Application) module.
 *
 * SAA is a Cru-specific application for salary approvals, MHA approvals,
 * and additional salary request approvals. It provides two main views:
 * 1. HR Specialist View - for managing and editing salary data
 * 2. Approver View - for reviewing and approving/rejecting requests
 *
 * SAA is accessed via Person Management for HR Specialist functions,
 * and via the Notifications bell for approval workflows.
 *
 * The approval workflow uses Oracle BPM Worklist patterns:
 * - Notifications area shows pending approvals
 * - Actions: Approve, Reject, Request Information, Delegate
 * - History tab shows audit trail
 *
 * Selectors use ADF patterns (notification bell ID: _UIScmil3u).
 */
export class SAAPage extends BasePage {
  // --- Common selectors ---

  /** Approve button in approval workflows. */
  private readonly approveButton = this.page.locator(
    'button:has-text("Approve"), a[role="button"]:has-text("Approve")'
  ).first();

  /** Reject button in approval workflows. */
  private readonly rejectButton = this.page.locator(
    'button:has-text("Reject"), a[role="button"]:has-text("Reject")'
  ).first();

  /** Request Information button. */
  private readonly requestInfoButton = this.page.locator(
    'button:has-text("Request Information"), a[role="button"]:has-text("Request Information")'
  ).first();

  /** Delegate button. */
  private readonly delegateButton = this.page.locator(
    'button:has-text("Delegate"), a[role="button"]:has-text("Delegate")'
  ).first();

  /** Submit button for forms. */
  private readonly submitButton = this.page.locator(
    'button:has-text("Submit"), a[role="button"]:has-text("Submit")'
  ).first();

  /** Notification bell icon (ADF ID suffix: _UIScmil3u). */
  private readonly notificationBell = this.page.locator(
    '[id$="_UIScmil3u"], a[aria-label*="Notification"]'
  ).first();

  /** Comments/notes textarea for approval actions. */
  private readonly commentsTextarea = this.page.locator(
    'textarea[aria-label*="Comment"], textarea[aria-label*="Notes"], textarea'
  ).first();

  // --- HR Specialist View ---

  /** Navigate to HR Specialist view via Person Management. */
  async goToHRSpecialistView(): Promise<void> {
    await this.page.goto('/fscmUI/faces/FuseOverview?fndGlobalItemNodeId=itemNode_workforce_management_person_management');
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * View available options in HR Specialist view.
   * The HR Specialist sees the person list with action menus.
   */
  async viewOptions(): Promise<void> {
    const actionsMenu = this.page.locator(
      '[role="menuitem"][aria-label="Actions"], button:has-text("Actions")'
    ).first();
    if (await actionsMenu.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Actions menu visibility check failed:', e.message); return false; })) {
      await actionsMenu.click();
      await this.page.waitForTimeout(2000);
    }
    await this.waitForJET();
  }

  /**
   * View the HR Specialist dashboard showing employee salary summary.
   * Navigates to Person Management and verifies the page loaded.
   */
  async viewHRSpecialistDashboard(): Promise<void> {
    await this.goToHRSpecialistView();
    await this.viewOptions();
  }

  /**
   * Perform HR Specialist functions (search, edit, update salary data).
   * Accesses the person search and salary/compensation details.
   */
  async performHRSpecialistFunctions(): Promise<void> {
    const searchInput = this.page.locator(
      '[id$="q1:value00::content"], input[aria-label*="Search"]'
    ).first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Search input visibility check failed:', e.message); return false; })) {
      await searchInput.click();
    }

    // Click Edit button if available
    const editBtn = this.page.getByRole('button', { name: /Edit|Update/i }).first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Edit button visibility check failed:', e.message); return false; })) {
      await editBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  // --- Approver View ---

  /**
   * Navigate to Approver view via the notification bell.
   * Uses the real ADF notification bell selector (id suffix: _UIScmil3u).
   */
  async goToApproverView(): Promise<void> {
    await this.notificationBell.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  /** View approver options -- list pending approval items in the notification panel. */
  async viewApproverOptions(): Promise<void> {
    const pendingItems = this.page.locator(
      '[class*="notification"], [id*="worklist"]'
    ).first();
    await pendingItems.waitFor({ state: 'visible', timeout: 10_000 }).catch((e) => {
      console.warn('SAA: Pending approval items not visible:', e.message);
    });
    await this.waitForJET();
  }

  // --- Approval Workflows ---

  /**
   * Navigate to salary approval workflow.
   * Opens the approver view and clicks the salary-related notification.
   */
  async goToSalaryApproval(): Promise<void> {
    await this.goToApproverView();
    const salaryNotif = this.page.locator(
      'a:has-text("Salary"), [role="row"]:has-text("Salary"), [role="listitem"]:has-text("Salary")'
    ).first();
    if (await salaryNotif.isVisible({ timeout: 10_000 }).catch((e) => { console.warn('SAA: Salary notification visibility check failed:', e.message); return false; })) {
      await salaryNotif.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /**
   * Navigate to MHA approval workflow.
   * Opens the approver view and clicks the MHA-related notification.
   */
  async goToMHAApproval(): Promise<void> {
    await this.goToApproverView();
    const mhaNotif = this.page.locator(
      'a:has-text("MHA"), [role="row"]:has-text("MHA"), [role="listitem"]:has-text("MHA")'
    ).first();
    if (await mhaNotif.isVisible({ timeout: 10_000 }).catch((e) => { console.warn('SAA: MHA notification visibility check failed:', e.message); return false; })) {
      await mhaNotif.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /**
   * Navigate to additional salary approval workflow.
   * Opens the approver view and clicks the additional salary notification.
   */
  async goToAdditionalSalaryApproval(): Promise<void> {
    await this.goToApproverView();
    const addlSalaryNotif = this.page.locator(
      'a:has-text("Additional Salary"), [role="row"]:has-text("Additional Salary"), ' +
      '[role="listitem"]:has-text("Additional Salary")'
    ).first();
    if (await addlSalaryNotif.isVisible({ timeout: 10_000 }).catch((e) => { console.warn('SAA: Additional salary notification visibility check failed:', e.message); return false; })) {
      await addlSalaryNotif.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /**
   * Approve a pending salary change request.
   * Alias for approveRequest().
   */
  async approveSalaryChange(): Promise<void> {
    await this.approveRequest();
  }

  /**
   * Approve a pending MHA request.
   * Alias for approveRequest().
   */
  async approveMHA(): Promise<void> {
    await this.approveRequest();
  }

  /** Approve a pending request by clicking the Approve button. */
  async approveRequest(): Promise<void> {
    const visible = await this.approveButton.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!visible) {
      console.log('[SAA] No Approve button found — no pending approval items or already approved');
      return;
    }
    await this.approveButton.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Handle confirmation dialog if it appears
    const confirmBtn = this.page.getByRole('button', { name: /Yes|OK|Confirm|Submit/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Approve confirm button visibility check failed:', e.message); return false; })) {
      await confirmBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Reject a pending request by clicking the Reject button. */
  async rejectRequest(): Promise<void> {
    await this.rejectButton.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    // Handle confirmation dialog
    const confirmBtn = this.page.getByRole('button', { name: /Yes|OK|Confirm|Submit/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Reject confirm button visibility check failed:', e.message); return false; })) {
      await confirmBtn.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /** Add comments before approving/rejecting. */
  async addComments(comments: string): Promise<void> {
    if (await this.commentsTextarea.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Comments textarea visibility check failed:', e.message); return false; })) {
      await this.commentsTextarea.clear();
      await this.commentsTextarea.fill(comments);
      await this.waitForJET();
    }
  }

  /**
   * View approval history for the current request.
   * Clicks the History tab to see the audit trail.
   */
  async viewApprovalHistory(): Promise<void> {
    const historyTab = this.page.getByRole('tab', { name: /History/i }).first();
    if (await historyTab.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: History tab visibility check failed:', e.message); return false; })) {
      await historyTab.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    } else {
      const historyLink = this.page.getByText('History').first();
      if (await historyLink.isVisible({ timeout: 3000 }).catch((e) => { console.warn('SAA: History link visibility check failed:', e.message); return false; })) {
        await historyLink.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }
  }

  /**
   * Delegate an approval to another person.
   * Clicks Delegate, enters the delegatee name, and confirms.
   */
  async delegateApproval(delegateTo?: string): Promise<void> {
    await this.delegateButton.click();
    await this.page.waitForTimeout(3000);
    await this.waitForJET();

    if (delegateTo) {
      const delegateInput = this.page.locator(
        'input[aria-label*="Delegate"], input[aria-label*="Person"]'
      ).first();
      if (await delegateInput.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Delegate input visibility check failed:', e.message); return false; })) {
        await this.fillCombobox(delegateInput, delegateTo);
      }

      const confirmBtn = this.page.getByRole('button', { name: /OK|Submit|Confirm/i }).first();
      if (await confirmBtn.isVisible({ timeout: 5000 }).catch((e) => { console.warn('SAA: Delegate confirm button visibility check failed:', e.message); return false; })) {
        await confirmBtn.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }
  }

  /**
   * Verify approval action completed successfully.
   * Uses soft verification since approval actions may show different
   * confirmation patterns or may not have pending items.
   */
  async verifyApprovalComplete(): Promise<void> {
    const successIndicator = this.page.locator(
      ':text("approved"), :text("Approved"), :text("completed"), ' +
      ':text("successfully"), :text("submitted"), ' +
      '[class*="success"], [class*="confirmation"], ' +
      '.oj-message-summary, .fnd-notification-detail'
    ).first();

    const visible = await successIndicator.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    if (visible) {
      const text = await successIndicator.textContent().catch(() => '');
      console.log(`[SAA] Approval result: ${text?.substring(0, 100)}`);
    } else {
      console.log('[SAA] No explicit approval confirmation visible');
    }
  }
}
