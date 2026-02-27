import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import type { UATTestCase } from '../../data/types';

/**
 * Oracle HCM Workforce Compensation page object.
 *
 * Covers:
 * - Base pay management (view/update salary)
 * - Individual compensation (bonuses, one-time payments)
 * - Workforce compensation planning (merit planning, budget allocation)
 * - Total compensation statements
 * - Grade step progression
 * - Compensation history
 *
 * Navigation: Navigator > My Client Groups > Compensation
 * Page type: ADF (uses apPlnDtl prefix for component IDs)
 *
 * Selectors sourced from:
 * - .cache/inspect/compensation-deep.json (live inspection)
 * - .cache/test-scripts/Cru_Workforce_Compensation_-_Test_Scripts_-_WIP.json (37 scripts)
 */
export class CompensationPage extends BasePage {
  // --- Navigation selectors (from compensation-deep.json) ---

  /** Navigator link for Compensation under My Client Groups. */
  private readonly compensationNavLink = this.page.locator(
    'a[title="Compensation"]'
  ).first();

  /** Plan dropdown on Compensation landing page (ADF selectOneChoice). */
  private readonly planDropdown = this.page.locator(
    '[id$="apPlnDtl:soc2"], [id*="apPlnDtl:soc2"]'
  ).first();

  /** Plan dropdown arrow button. */
  private readonly planDropdownButton = this.page.locator(
    '[id$="apPlnDtl:soc2::drop"], [id*="apPlnDtl:soc2::drop"]'
  ).first();

  // --- Person search ---

  /** Search input to find an employee by name or number. */
  private readonly personSearch = this.page.locator(
    'input[aria-label*="Search"], input[placeholder*="Search"]'
  ).first();

  // --- Base Pay / Salary section ---

  /** Effective date field for salary changes. */
  private readonly effectiveDate = this.page.locator(
    'input[aria-label*="Effective Date"], input[id*="EffectiveDate"]'
  ).first();

  /** Salary amount field. */
  private readonly salaryAmount = this.page.locator(
    'input[aria-label*="Salary Amount"], input[aria-label*="Amount"]'
  ).first();

  /** Salary basis / frequency (LOV). */
  private readonly salaryBasis = this.page.locator(
    'input[aria-label*="Salary Basis"], select[aria-label*="Salary Basis"]'
  ).first();

  /** Currency field. */
  private readonly currency = this.page.locator(
    'input[aria-label*="Currency"], select[aria-label*="Currency"]'
  ).first();

  /** Action reason (LOV/dropdown). */
  private readonly actionReason = this.page.locator(
    'input[aria-label*="Action Reason"], select[aria-label*="Action Reason"], input[aria-label*="Reason"]'
  ).first();

  // --- Individual Compensation / Bonus section ---

  /** Plan name for individual compensation. */
  private readonly planName = this.page.locator(
    'input[aria-label*="Plan"], select[aria-label*="Plan"]'
  ).first();

  /** Component name (LOV). */
  private readonly componentName = this.page.locator(
    'input[aria-label*="Component"], select[aria-label*="Component"]'
  ).first();

  /** Bonus amount. */
  private readonly bonusAmount = this.page.locator(
    'input[aria-label*="Amount"]'
  ).first();

  /** Bonus type. */
  private readonly bonusType = this.page.locator(
    'input[aria-label*="Type"], select[aria-label*="Type"]'
  ).first();

  // --- Workforce Compensation Planning / Merit ---

  /** Compensation plan (LOV). */
  private readonly compensationPlan = this.page.locator(
    'input[aria-label*="Compensation Plan"], select[aria-label*="Compensation Plan"]'
  ).first();

  /** Budget pool name. */
  private readonly budgetPool = this.page.locator(
    'input[aria-label*="Budget"], select[aria-label*="Budget Pool"]'
  ).first();

  /** Merit percentage field. */
  private readonly meritPercentage = this.page.locator(
    'input[aria-label*="Merit"], input[aria-label*="Percentage"]'
  ).first();

  // --- Total Compensation Statement ---

  /** Statement definition / template. */
  private readonly statementDefinition = this.page.locator(
    'input[aria-label*="Statement"], select[aria-label*="Statement"]'
  ).first();

  /** Period selector for statements. */
  private readonly statementPeriod = this.page.locator(
    'input[aria-label*="Period"], select[aria-label*="Period"]'
  ).first();

  // --- Grade / Step ---

  /** Grade field. */
  private readonly grade = this.page.locator(
    'input[aria-label*="Grade"], select[aria-label*="Grade"]'
  ).first();

  /** Step field. */
  private readonly step = this.page.locator(
    'input[aria-label*="Step"], select[aria-label*="Step"]'
  ).first();

  // --- Job Code ---

  /** Job code field. */
  private readonly jobCode = this.page.locator(
    'input[aria-label*="Job Code"], input[aria-label*="Job"]'
  ).first();

  /** Job name field. */
  private readonly jobName = this.page.locator(
    'input[aria-label*="Job Name"], input[aria-label*="Name"]'
  ).first();

  // --- Navigation methods ---

  /** Navigate to the Compensation area via the Navigator menu. */
  async navigateToCompensation(): Promise<void> {
    const navigator = this.page.locator('a[title="Navigator"]');
    await navigator.click();
    await this.page.waitForTimeout(2000);

    // Expand "Show More" if present
    const showMore = this.page.locator('a:has-text("Show More")').first();
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
      await this.page.waitForTimeout(2000);
    }

    // Click Compensation link (force: true to bypass sticky header interception)
    await this.compensationNavLink.click({ force: true });
    await this.page.waitForLoadState('networkidle', { timeout: 60_000 });
    await this.page.waitForTimeout(5000);
    await this.waitForJET();
  }

  /**
   * Select a compensation plan from the plan dropdown (ADF selectOneChoice).
   * Uses the apPlnDtl:soc2 component discovered via live inspection.
   */
  async selectCompensationPlan(name: string): Promise<void> {
    // Click the dropdown arrow to open the plan list
    await this.planDropdownButton.click();
    await this.page.waitForTimeout(1500);

    // Select the matching option from the dropdown popup
    const option = this.page.getByRole('option', { name }).first();
    if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
      await option.click();
    } else {
      // Fallback: click by text match in list items
      const listItem = this.page.locator(`li:has-text("${name}")`).first();
      if (await listItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await listItem.click();
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForJET();
  }

  // --- Person search ---

  /** Search for an employee by name or person number. */
  async searchPerson(query: string): Promise<void> {
    await this.fillField(this.personSearch, query);
    await this.page.waitForTimeout(5000);
    await this.waitForJET();

    // Click first search result if visible
    const firstResult = this.page.locator(
      '[role="option"]:first-child, [role="row"]:first-child a'
    ).first();
    if (await firstResult.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstResult.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Review salary history for an employee.
   * Test Script: HCM.COMP.101.00 - Navigate to Base Pay > Salary History.
   */
  async reviewSalaryHistory(): Promise<void> {
    // Navigate to Salary History tab within Base Pay
    const salaryHistoryLink = this.page.getByText('Salary History').first();
    if (await salaryHistoryLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await salaryHistoryLink.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    // Look for Base Pay link first if Salary History is nested
    const basePayLink = this.page.getByText('Base Pay').first();
    if (await basePayLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await basePayLink.click();
      await this.page.waitForTimeout(2000);
      await this.waitForJET();

      const salaryHistory = this.page.getByText('Salary History').first();
      if (await salaryHistory.isVisible({ timeout: 3000 }).catch(() => false)) {
        await salaryHistory.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }
  }

  /**
   * Change salary amount for an employee.
   * Test Script: HCM.COMP.102.00 - Edit salary with new amount.
   */
  async changeSalary(amount: string): Promise<void> {
    // Click Add/Edit to open salary entry
    const addSalaryButton = this.page.getByRole('button', { name: /Add|Create|New/i }).first();
    if (await addSalaryButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addSalaryButton.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }

    await this.fillField(this.salaryAmount, amount);
    await this.waitForJET();
  }

  /**
   * Mass change salaries (workforce compensation planning).
   * Test Script: HCM.COMP.2xx series.
   */
  async massChangeSalaries(): Promise<void> {
    // Navigate to Workforce Compensation area
    const workforceCompLink = this.page.getByText('Workforce Compensation').first();
    if (await workforceCompLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await workforceCompLink.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Allocate Individual Compensation Plan (ICP).
   * Test Script: HCM.COMP.3xx series - Individual Compensation.
   */
  async allocateICP(): Promise<void> {
    const icpLink = this.page.getByText('Individual Compensation').first();
    if (await icpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await icpLink.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Run grade step progression process.
   * Test Script: HCM.COMP.2xx series - Grade Step Progression.
   */
  async runGradeStepProgression(): Promise<void> {
    const gradeStepLink = this.page.getByText('Grade Step Progression').first();
    if (await gradeStepLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await gradeStepLink.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * View My Compensation (employee self-service view).
   * Test Script: HCM.COMP.4xx series - Total Compensation.
   */
  async viewMyCompensation(): Promise<void> {
    const myCompLink = this.page.getByText('My Compensation').first();
    if (await myCompLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await myCompLink.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    } else {
      // Try Total Compensation Statement link
      const totalCompLink = this.page.getByText('Total Compensation Statement').first();
      if (await totalCompLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await totalCompLink.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }
  }

  // --- Base Pay / Salary operations ---

  /** Fill salary / base pay fields from a test case. */
  async fillBasePay(tc: UATTestCase): Promise<void> {
    if (tc.testData) {
      const data = tc.testData;

      // Try to extract and fill effective date
      const dateMatch = data.match(/effective\s*date[:\s]*([^\n,;]+)/i);
      if (dateMatch) {
        await this.fillField(this.effectiveDate, dateMatch[1].trim());
      }

      // Try to extract salary amount
      const amountMatch = data.match(/(?:salary|amount)[:\s]*\$?([\d,.]+)/i);
      if (amountMatch) {
        await this.fillField(this.salaryAmount, amountMatch[1].trim());
      }

      // Try to extract salary basis
      const basisMatch = data.match(/(?:salary\s*basis|basis|frequency)[:\s]*([^\n,;]+)/i);
      if (basisMatch) {
        await this.fillCombobox(this.salaryBasis, basisMatch[1].trim());
      }
    }
  }

  // --- Individual Compensation / Bonus operations ---

  /** Fill individual compensation (bonus) fields from a test case. */
  async fillIndividualCompensation(tc: UATTestCase): Promise<void> {
    if (tc.testData) {
      const data = tc.testData;

      const planMatch = data.match(/(?:plan)[:\s]*([^\n,;]+)/i);
      if (planMatch) {
        await this.fillCombobox(this.planName, planMatch[1].trim());
      }

      const componentMatch = data.match(/(?:component)[:\s]*([^\n,;]+)/i);
      if (componentMatch) {
        await this.fillCombobox(this.componentName, componentMatch[1].trim());
      }

      const amountMatch = data.match(/(?:amount|bonus)[:\s]*\$?([\d,.]+)/i);
      if (amountMatch) {
        await this.fillField(this.bonusAmount, amountMatch[1].trim());
      }

      const typeMatch = data.match(/(?:type)[:\s]*([^\n,;]+)/i);
      if (typeMatch) {
        await this.fillCombobox(this.bonusType, typeMatch[1].trim());
      }
    }
  }

  // --- Workforce Compensation Planning ---

  /** Fill workforce compensation planning fields (merit/budget). */
  async fillCompensationPlanning(tc: UATTestCase): Promise<void> {
    if (tc.testData) {
      const data = tc.testData;

      const planMatch = data.match(/(?:comp(?:ensation)?\s*plan|plan)[:\s]*([^\n,;]+)/i);
      if (planMatch) {
        await this.fillCombobox(this.compensationPlan, planMatch[1].trim());
      }

      const budgetMatch = data.match(/(?:budget)[:\s]*([^\n,;]+)/i);
      if (budgetMatch) {
        await this.fillCombobox(this.budgetPool, budgetMatch[1].trim());
      }

      const meritMatch = data.match(/(?:merit|percentage)[:\s]*([\d.]+)/i);
      if (meritMatch) {
        await this.fillField(this.meritPercentage, meritMatch[1].trim());
      }
    }
  }

  // --- Total Compensation Statement ---

  /** View or generate a total compensation statement. */
  async viewTotalCompensation(tc: UATTestCase): Promise<void> {
    if (tc.testData) {
      const data = tc.testData;

      const stmtMatch = data.match(/(?:statement)[:\s]*([^\n,;]+)/i);
      if (stmtMatch) {
        await this.fillCombobox(this.statementDefinition, stmtMatch[1].trim());
      }

      const periodMatch = data.match(/(?:period)[:\s]*([^\n,;]+)/i);
      if (periodMatch) {
        await this.fillCombobox(this.statementPeriod, periodMatch[1].trim());
      }
    }
  }

  // --- Compensation History ---

  /** View compensation history for an employee. */
  async viewHistory(tc: UATTestCase): Promise<void> {
    // Navigate to history tab/section
    const historyTab = this.page.getByRole('tab', { name: /History/i }).first();
    if (await historyTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await historyTab.click();
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    } else {
      // Try link-based navigation
      const historyLink = this.page.getByText('Compensation History').first();
      if (await historyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await historyLink.click();
        await this.page.waitForTimeout(3000);
        await this.waitForJET();
      }
    }
  }

  // --- Job Code setup ---

  /** Fill job code fields for creating a job code. */
  async fillJobCode(tc: UATTestCase): Promise<void> {
    if (tc.testData) {
      const data = tc.testData;

      const codeMatch = data.match(/(?:job\s*code|code)[:\s]*([^\n,;]+)/i);
      if (codeMatch) {
        await this.fillField(this.jobCode, codeMatch[1].trim());
      }

      const nameMatch = data.match(/(?:job\s*name|name)[:\s]*([^\n,;]+)/i);
      if (nameMatch) {
        await this.fillField(this.jobName, nameMatch[1].trim());
      }

      const gradeMatch = data.match(/(?:grade)[:\s]*([^\n,;]+)/i);
      if (gradeMatch) {
        await this.fillCombobox(this.grade, gradeMatch[1].trim());
      }

      const stepMatch = data.match(/(?:step)[:\s]*([^\n,;]+)/i);
      if (stepMatch) {
        await this.fillCombobox(this.step, stepMatch[1].trim());
      }
    }
  }

  // --- Submission ---

  /** Click Submit/Save and wait for processing. */
  async clickSubmit(): Promise<void> {
    // Try Playwright getByRole first for Redwood-style buttons
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    const isVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await submitBtn.click();
      await this.page.waitForTimeout(10_000);
      await this.waitForJET();
    } else {
      // Fall back to ADF button approach
      await this.clickAdfButton('Submit');
    }
  }

  /** Click Add/Create button. */
  async clickAdd(): Promise<void> {
    const addBtn = this.page.getByRole('button', { name: /Add|Create/i }).first();
    const isVisible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await addBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    }
  }

  /** Click Save button. */
  async clickSave(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
    const isVisible = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await saveBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    } else {
      await this.clickAdfButton('Save');
    }
  }

  /** Click OK button (used in edit dialogs). */
  async clickOK(): Promise<void> {
    const okBtn = this.page.getByRole('button', { name: 'OK' }).first();
    const isVisible = await okBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await okBtn.click();
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
    } else {
      await this.clickAdfButton('OK');
    }
  }

  /** Verify a success confirmation is displayed. */
  async expectSuccess(): Promise<void> {
    const successIndicator = this.page.locator(
      '[class*="success"], [class*="confirmation"], ' +
      ':text("successfully"), :text("completed"), :text("saved")'
    ).first();
    await successIndicator.waitFor({ state: 'visible', timeout: 30_000 });
  }
}
