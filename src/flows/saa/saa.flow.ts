import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { SAAPage } from '../../pages/saa/saa.page';
import type { UATTestCase } from '../../data/types';

/**
 * Flow for SAA (Salary Approval Application) operations.
 *
 * SAA provides two main views:
 * 1. HR Specialist View - accessed via Person Management for editing salary data
 * 2. Approver View - accessed via Notifications bell for approving/rejecting requests
 *
 * Routes based on test script:
 * - SAA HR Specialist View → HR specialist view with action menus
 * - HR Specialist Functions → HR specialist edit/update operations
 * - Approver View → Notifications-based approval list
 * - Salary Approval Workflow → Approve/reject salary change requests
 * - MHA Approval workflow → Approve/reject MHA requests
 * - Addl Salary Approval workflow → Approve/reject additional salary requests
 *
 * Uses ADF selectors:
 * - Notification bell: id suffix _UIScmil3u
 * - Person search: id suffix q1:value00::content
 * - Approval buttons: Approve, Reject, Delegate, Request Information
 */
export class SAAFlow extends BaseFlow {
  private saa: SAAPage;

  constructor(page: Page) {
    super(page);
    this.saa = new SAAPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    const script = tc.testScript.toLowerCase();
    const process = tc.businessProcess.toLowerCase();

    if (script.includes('hr specialist view') || process.includes('view options')) {
      await this.executeHRSpecialistView(tc);
    } else if (script.includes('hr specialist function') || process.includes('hr specialist function')) {
      await this.executeHRSpecialistFunctions(tc);
    } else if (script.includes('approver view')) {
      await this.executeApproverView(tc);
    } else if (script.includes('salary approval') || process.includes('salary request approval')) {
      await this.executeSalaryApproval(tc);
    } else if (script.includes('mha approval') || process.includes('mha request')) {
      await this.executeMHAApproval(tc);
    } else if (script.includes('addl salary') || process.includes('additional salary')) {
      await this.executeAdditionalSalaryApproval(tc);
    } else if (process.includes('delegate') || script.includes('delegate')) {
      await this.executeDelegation(tc);
    } else if (process.includes('history') || script.includes('history')) {
      await this.executeViewHistory(tc);
    } else {
      // Default: HR specialist view
      await this.executeHRSpecialistView(tc);
    }
  }

  /** Navigate to HR Specialist view and display options. */
  private async executeHRSpecialistView(tc: UATTestCase): Promise<void> {
    await this.saa.goToHRSpecialistView();
    await this.saa.viewOptions();
  }

  /** Navigate to HR Specialist view and perform edit/update functions. */
  private async executeHRSpecialistFunctions(tc: UATTestCase): Promise<void> {
    await this.saa.goToHRSpecialistView();
    await this.saa.performHRSpecialistFunctions();
  }

  /** Navigate to Approver view via notifications. */
  private async executeApproverView(tc: UATTestCase): Promise<void> {
    await this.saa.goToApproverView();
    await this.saa.viewApproverOptions();
  }

  /** Execute salary approval workflow. */
  private async executeSalaryApproval(tc: UATTestCase): Promise<void> {
    await this.saa.goToSalaryApproval();
    await this.saa.approveRequest();
    await this.saa.verifyApprovalComplete();
  }

  /** Execute MHA approval workflow. */
  private async executeMHAApproval(tc: UATTestCase): Promise<void> {
    await this.saa.goToMHAApproval();
    await this.saa.approveRequest();
    await this.saa.verifyApprovalComplete();
  }

  /** Execute additional salary approval workflow. */
  private async executeAdditionalSalaryApproval(tc: UATTestCase): Promise<void> {
    await this.saa.goToAdditionalSalaryApproval();
    await this.saa.approveRequest();
    await this.saa.verifyApprovalComplete();
  }

  /** Execute approval delegation. */
  private async executeDelegation(tc: UATTestCase): Promise<void> {
    // Determine which approval to delegate based on test data
    const process = tc.businessProcess.toLowerCase();
    if (process.includes('salary')) {
      await this.saa.goToSalaryApproval();
    } else if (process.includes('mha')) {
      await this.saa.goToMHAApproval();
    } else {
      await this.saa.goToApproverView();
    }

    // Extract delegatee from test data if available
    const delegateTo = this.extractDelegatee(tc);
    await this.saa.delegateApproval(delegateTo || undefined);
    await this.saa.verifyApprovalComplete();
  }

  /** View approval history. */
  private async executeViewHistory(tc: UATTestCase): Promise<void> {
    await this.saa.goToApproverView();
    await this.saa.viewApprovalHistory();
  }

  /** Extract delegatee name from test case data. */
  private extractDelegatee(tc: UATTestCase): string | null {
    const sources = [tc.testData, tc.preConditions];
    for (const src of sources) {
      if (!src) continue;
      const match = src.match(
        /(?:delegate\s*to|delegatee|person|name)[:\s]*([^\n,;]+)/i
      );
      if (match) return match[1].trim();
    }
    return null;
  }
}
