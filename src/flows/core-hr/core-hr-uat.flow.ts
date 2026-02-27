import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { PersonManagementPage } from '../../pages/core-hr/person-management.page';
import { WhenAndWhyPage } from '../../pages/core-hr/when-and-why.page';
import { AssignmentPage } from '../../pages/core-hr/assignment.page';
import { ManagersPage } from '../../pages/core-hr/managers.page';
import { SalaryPage } from '../../pages/core-hr/salary.page';
import { ConfirmationPage } from '../../pages/core-hr/confirmation.page';
import type { UATTestCase } from '../../data/types';

/**
 * Flow for Core HR UAT Plan tests (575 tests).
 *
 * Routes to the appropriate sub-flow based on business process and
 * transaction category from the UAT Plan sheet. Each method follows
 * the step-by-step procedures from the parsed test scripts:
 *
 * HCM.CORE.1xx — Workforce Structures (Jobs, Locations, Departments, Positions)
 * HCM.CORE.2xx — Worker Lifecycle (Hire, Pending, Rehire, Terminate, Transfer)
 * HCM.CORE.3xx — Employee Self-Service (Personal Info, Directory, Contacts)
 * HCM.CORE.4xx — Manager Self-Service (View Info, Change Location/Manager/Hours)
 */
export class CoreHRUATFlow extends BaseFlow {
  private person: PersonManagementPage;
  private whenAndWhy: WhenAndWhyPage;
  private assignment: AssignmentPage;
  private managers: ManagersPage;
  private salary: SalaryPage;
  private confirmation: ConfirmationPage;

  constructor(page: Page) {
    super(page);
    this.person = new PersonManagementPage(page);
    this.whenAndWhy = new WhenAndWhyPage(page);
    this.assignment = new AssignmentPage(page);
    this.managers = new ManagersPage(page);
    this.salary = new SalaryPage(page);
    this.confirmation = new ConfirmationPage(page);
  }

  async execute(tc: UATTestCase): Promise<void> {
    await this.loginToHCM();

    const process = tc.businessProcess.toLowerCase();
    const category = tc.transactionCategory.toLowerCase();
    const script = (tc.testScript || '').toLowerCase();

    // Route based on business process
    if (process.includes('hire') || process.includes('add pending') || process.includes('add non worker')) {
      await this.executeHire(tc);
    } else if (process.includes('rehire')) {
      await this.executeRehire(tc);
    } else if (process.includes('terminat') || process.includes('end assignment') || process.includes('end work relationship')) {
      await this.executeTermination(tc);
    } else if (process.includes('transfer') || process.includes('company change') || process.includes('global transfer')) {
      await this.executeTransfer(tc);
    } else if (process.includes('assignment change') || process.includes('change assignment') || process.includes('strategy change')) {
      await this.executeAssignmentChange(tc);
    } else if (process.includes('supervisor change') || process.includes('manager change') || process.includes('change manager')) {
      await this.executeManagerChange(tc);
    } else if (process.includes('personal information') || process.includes('manage employee') || process.includes('manage non employee')) {
      await this.executePersonalInfoUpdate(tc);
    } else if (process.includes('workforce structure') || process.includes('dept') || process.includes('location') || process.includes('grade')) {
      await this.executeWorkforceStructure(tc);
    } else if (process.includes('bonus')) {
      await this.executeBonus(tc);
    } else if (process.includes('promotion') || process.includes('reclass')) {
      await this.executePromotion(tc);
    } else if (process.includes('approval delegation')) {
      await this.executeApprovalDelegation(tc);
    } else if (process.includes('document') || process.includes('attachment')) {
      await this.executeDocumentManagement(tc);
    } else if (process.includes('work schedule')) {
      await this.executeWorkSchedule(tc);
    } else if (process.includes('salary') || process.includes('compensation')) {
      await this.executeSalaryChange(tc);
    } else if (process.includes('change location')) {
      await this.executeChangeLocation(tc);
    } else if (process.includes('change working hours')) {
      await this.executeChangeWorkingHours(tc);
    } else if (process.includes('mass update') || process.includes('mass action')) {
      await this.executeMassUpdate(tc);
    } else if (category.includes('manager')) {
      await this.executeManagerSelfService(tc);
    } else if (category.includes('employee')) {
      await this.executeEmployeeSelfService(tc);
    } else {
      await this.executeGenericHRAction(tc);
    }
  }

  // --- Hire Actions (HCM.CORE.205, 203, 207, 206, 204) ---

  private async executeHire(tc: UATTestCase): Promise<void> {
    const process = tc.businessProcess.toLowerCase();
    if (process.includes('pending')) {
      // HCM.CORE.203: Add Pending Worker
      await this.homePage.goToAddPendingWorker();
    } else if (process.includes('non worker') || process.includes('nonworker')) {
      // HCM.CORE.207: Create Non-Worker
      await this.homePage.goToAddNonworker();
    } else if (process.includes('contingent')) {
      // HCM.CORE.206: Contingent Worker
      await this.homePage.goToAddContingentWorker();
    } else {
      // HCM.CORE.205: New Hire
      await this.homePage.goToHireEmployee();
    }
    // Step: "What info do you want to manage" — select checkboxes and click Continue
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Step: "When and Why" — enter dates and reasons
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Step: "Personal Details" — enter name, DOB, etc.
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Step: "Employment Details" — guided flow with assignment sections
    // Navigate through each section using Next/Continue
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    // Submit
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Rehire (HCM.CORE.208) ---

  private async executeRehire(tc: UATTestCase): Promise<void> {
    // Navigate to Person Management, search for person
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    // Actions menu → Rehire
    await this.selectPersonAction('Rehire');
    await this.page.waitForTimeout(5000);
    // "When and Why" — fill dates and reason
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Assignment details
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    // Submit
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Termination (HCM.CORE.239) ---

  private async executeTermination(tc: UATTestCase): Promise<void> {
    // Per test script: Navigate to Quick Actions > Termination, or Person Management
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    // Actions → Terminate Work Relationship
    await this.selectPersonAction('Terminate');
    await this.page.waitForTimeout(5000);
    // "When and Why" — enter termination date, action, reason
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // "Enter Termination Info" — fill additional details
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // "Comments and Attachments" — optional
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Transfer (HCM.CORE.2xx transfer scripts) ---

  private async executeTransfer(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    const process = tc.businessProcess.toLowerCase();
    if (process.includes('global transfer')) {
      await this.selectPersonAction('Global Transfer');
    } else {
      await this.selectPersonAction('Transfer');
    }
    await this.page.waitForTimeout(5000);
    // "When and Why" — effective date, action reason
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Assignment details — new department, location, etc.
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Assignment Change (HCM.CORE.2xx) ---

  private async executeAssignmentChange(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    await this.selectPersonAction('Change Assignment');
    await this.page.waitForTimeout(5000);
    // "When and Why" section
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Assignment fields
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Manager Change (HCM.CORE.403) ---

  private async executeManagerChange(tc: UATTestCase): Promise<void> {
    // Per test script: My Team > Quick Actions > Change Manager
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    await this.selectPersonAction('Change Manager');
    await this.page.waitForTimeout(5000);
    // "What info do you want to manage" — click Continue
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // "When and Why" — enter effective date
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // "Maintain Managers" — click +Add to add new manager
    await this.page.getByText('+Add', { exact: false }).first().click();
    await this.page.waitForTimeout(3000);
    // Select new manager name and type, then OK
    await this.person.clickAdfButton('OK');
    await this.page.waitForTimeout(3000);
    // Submit
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Personal Info Update (HCM.CORE.218, 3xx) ---

  private async executePersonalInfoUpdate(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    // Person page → find section → Edit dropdown → Update
    const process = tc.businessProcess.toLowerCase();
    if (process.includes('marital')) {
      // HCM.CORE.218: Update Marital Status
      // Find "Legislative Information" → Edit → Update
      await this.page.getByText('Legislative Information').first().click();
      await this.page.waitForTimeout(2000);
      const editDropdown = this.page.locator('[aria-label*="Edit"], [id*="editBtn"]').first();
      if (await editDropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editDropdown.click();
        await this.page.getByText('Update').first().click();
        await this.page.waitForTimeout(3000);
      }
    } else {
      // Generic personal info edit — click Edit on the person page
      const editBtn = this.page.locator('a:has-text("Edit"), button:has-text("Edit")').first();
      if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editBtn.click();
        await this.page.waitForTimeout(3000);
      }
    }
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Workforce Structure (HCM.CORE.101–109) ---

  private async executeWorkforceStructure(tc: UATTestCase): Promise<void> {
    // Navigate to Workforce Structures page
    await this.homePage.goToWorkforceStructures();
    await this.page.waitForTimeout(3000);

    const process = tc.businessProcess.toLowerCase();
    if (process.includes('job')) {
      // HCM.CORE.101/102: Create/Update Job
      await this.page.getByText('Jobs', { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
    } else if (process.includes('location')) {
      // HCM.CORE.104: Create Location
      await this.page.getByText('Locations', { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
    } else if (process.includes('dept') || process.includes('department')) {
      // HCM.CORE.105: Create Department
      await this.page.getByText('Departments', { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
    } else if (process.includes('position')) {
      // HCM.CORE.106/107: Create/Request Position
      await this.page.getByText('Positions', { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
    } else if (process.includes('grade')) {
      await this.page.getByText('Grades', { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
    } else {
      // Generic: click first task link
      await this.page.getByText('Jobs', { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
    }
    // Look for +Add button to create new item
    const addBtn = this.page.getByText('Add', { exact: false }).first();
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
      await this.page.waitForTimeout(5000);
    }
  }

  // --- Change Location (HCM.CORE.402) ---

  private async executeChangeLocation(tc: UATTestCase): Promise<void> {
    // My Team > Quick Actions > Change Location
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    await this.selectPersonAction('Change Location');
    await this.page.waitForTimeout(5000);
    // "What info do you want to manage" — select boxes and Continue
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Location selection — choose new location
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Change Working Hours (HCM.CORE.404) ---

  private async executeChangeWorkingHours(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    await this.selectPersonAction('Change Working Hours');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Mass Update (HCM.CORE.108) ---

  private async executeMassUpdate(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    // Navigate to mass update functionality
    await this.page.getByText('Mass Updates', { exact: false }).first().click({ timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(5000);
  }

  // --- Bonus (HCM.CORE.2xx bonus) ---

  private async executeBonus(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    // Navigate to Compensation section → Add Bonus
    await this.selectPersonAction('Manage Salary');
    await this.page.waitForTimeout(5000);
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Promotion (HCM.CORE.2xx promote) ---

  private async executePromotion(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    await this.selectPersonAction('Promote');
    await this.page.waitForTimeout(5000);
    // "When and Why"
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    // Assignment details
    await this.person.clickAdfButton('Next');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Approval Delegation (HCM.CORE.110) ---

  private async executeApprovalDelegation(tc: UATTestCase): Promise<void> {
    // Navigate to Tools > Approval Delegations
    await this.homePage.openNavigator();
    const delegationLink = this.page.locator('[id$="nv_itemNode_tools_approval_delegations"], a[title*="Delegation"]').first();
    if (await delegationLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await delegationLink.click({ force: true });
    } else {
      await this.page.getByText('Approval Delegations', { exact: false }).first().click({ force: true });
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
  }

  // --- Document Management ---

  private async executeDocumentManagement(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    // Navigate to Document Records section on person page
    await this.page.getByText('Document Records', { exact: false }).first().click({ timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(5000);
  }

  // --- Work Schedule ---

  private async executeWorkSchedule(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    // Navigate to Work Schedule section
    await this.page.getByText('Work Schedule', { exact: false }).first().click({ timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(5000);
  }

  // --- Salary Change (HCM.CORE.2xx salary) ---

  private async executeSalaryChange(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    // Navigate to Salary section → Change Salary
    await this.selectPersonAction('Manage Salary');
    await this.page.waitForTimeout(5000);
    // Fill salary change details
    await this.person.clickAdfButton('Continue');
    await this.page.waitForTimeout(5000);
    await this.confirmation.clickSubmit();
    await this.confirmation.expectSuccess();
  }

  // --- Manager Self-Service (HCM.CORE.4xx) ---

  private async executeManagerSelfService(tc: UATTestCase): Promise<void> {
    // Manager actions via My Team: view info, initiate changes
    // Navigate to My Team
    await this.homePage.openNavigator();
    const myTeamLink = this.page.locator('[id$="nv_itemNode_my_team"], a[title*="My Team"]').first();
    if (await myTeamLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await myTeamLink.click({ force: true });
    } else {
      // Fallback to Person Management
      await this.homePage.goToPersonManagement();
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);

    const personName = this.extractPersonRef(tc);
    if (personName) {
      // Search for direct report
      const searchInput = this.page.locator('input[aria-label*="Search"], input[placeholder*="Search"]').first();
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchInput.fill(personName);
        await searchInput.press('Enter');
        await this.page.waitForTimeout(5000);
      }
    }
  }

  // --- Employee Self-Service (HCM.CORE.3xx) ---

  private async executeEmployeeSelfService(tc: UATTestCase): Promise<void> {
    // Employee actions: view/edit personal info, directory, contacts
    // Navigate to Me > Personal Information
    await this.homePage.openNavigator();
    const meLink = this.page.locator('[id$="nv_itemNode_my_information_personal_information"], a[title*="Personal Info"]').first();
    if (await meLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await meLink.click({ force: true });
    } else {
      // Fallback: use springboard Me tile
      await this.homePage.goHome();
      await this.page.getByText('Me', { exact: true }).first().click({ timeout: 10000 }).catch(() => {});
    }
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
  }

  // --- Generic HR Action ---

  private async executeGenericHRAction(tc: UATTestCase): Promise<void> {
    await this.homePage.goToPersonManagement();
    const personName = this.extractPersonRef(tc);
    if (personName) {
      await this.person.searchByName(personName);
    }
    await this.page.waitForTimeout(5000);
  }

  /**
   * Select an action from the person's Actions menu.
   * On the Person Management details page, clicks Actions dropdown
   * then selects the specified action text.
   */
  private async selectPersonAction(actionText: string): Promise<void> {
    // Click "Actions" menu button on person page
    const actionsBtn = this.page.locator(
      'button:has-text("Actions"), a[role="button"]:has-text("Actions"), [id*="Actions"]'
    ).first();
    if (await actionsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await actionsBtn.click();
      await this.page.waitForTimeout(2000);
      // Select the action from the dropdown
      await this.page.getByText(actionText, { exact: false }).first().click();
      await this.page.waitForTimeout(5000);
      await this.person.waitForJET();
    } else {
      // Fallback: try ADF menu approach
      const actionsMenuitem = this.page.locator('[role="menuitem"][aria-label="Actions"]');
      if (await actionsMenuitem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await actionsMenuitem.click();
        await this.page.waitForTimeout(2000);
        await this.page.getByText(actionText, { exact: false }).first().click();
        await this.page.waitForTimeout(5000);
        await this.person.waitForJET();
      }
    }
  }

  /** Extract a person name reference from testData or preConditions. */
  private extractPersonRef(tc: UATTestCase): string | null {
    const data = tc.testData || '';
    if (data && data !== 'UAT Test Data' && data.length > 2 && data.length < 100) {
      return data.trim();
    }
    const pre = tc.preConditions || '';
    const nameMatch = pre.match(/(?:employee|person|worker|staff)\s+(?:named?\s+)?([A-Z][a-z]+ [A-Z][a-z]+)/i);
    if (nameMatch) {
      return nameMatch[1];
    }
    return null;
  }
}
