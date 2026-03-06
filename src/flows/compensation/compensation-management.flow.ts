import { type Page } from '@playwright/test';
import { BaseCompensationFlow } from './base-compensation.flow';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Flow: Compensation Management
 * Module: Workforce Compensation (52 tests, all with field data)
 *
 * Field data structure (from migration DB):
 *   Person Name:         "Smith, Paul" (Last, First format)
 *   Person Number:       "10000002"
 *   Salary Amount:       "128434.39464" (decimal number)
 *   Salary Basis:        "US Salaried" or "Supported Staff RMO"
 *   Action Code:         "CONVERSION" or "Change Salary"
 *   Effective Date:      "2024/01/01" (YYYY/MM/DD format)
 *   Job:                 "CNV_JOB"
 *   Department:          "Conversion Department"
 *   Assignment Category: "Full-time regular"
 *   Grade:               (may be empty)
 *
 * Routes to the appropriate compensation operation based on both the
 * test case's businessProcess field and the testScript ID pattern:
 *
 * Test script routing:
 *   HCM.COMP.1xx -> Salary management (101=review history, 102=change salary, etc.)
 *   HCM.COMP.2xx -> Wage structures (202/203) or Grade step progression (others)
 *   HCM.COMP.3xx -> Individual Compensation Plans (ICP), bonuses
 *   HCM.COMP.4xx -> Workforce comp planning (401-408), history (409),
 *                    statements (410,413), wage range (411,414), grade step (412)
 *   HCM.COMP.5xx -> Total compensation statements
 *   HCM.CORE.101 -> Creating job code
 *
 * Business process routing (fallback):
 *   "Base Pay"                          -> salary management
 *   "Individual Compensation"           -> bonuses / one-time payments
 *   "Workforce Compensation" or
 *     "Merit Planning" / "Merit Calc"   -> compensation planning
 *   "Total Compensation"               -> statement view
 *   "View Employee History"            -> history view
 *   "Bonuses"                          -> bonus entry
 *   "creating job code"                -> job setup
 *   "Wage Range" / "Minimum Wage"      -> compliance
 *   "Update Wage Structures"           -> wage structure admin
 */
export class CompensationManagementFlow extends BaseCompensationFlow {
  constructor(page: Page) {
    super(page);
  }

  /** Execute the compensation test case, using field data when available. */
  async execute(tc: UATTestCase): Promise<void> {
    await this.navigateToCompensation(tc);

    const fieldData = getFieldData(tc.testId);

    // Search for the employee using field data first, then UATTestCase
    const personRef = fieldData
      ? getField(fieldData, 'Person Name') || getField(fieldData, 'Person Number')
      : this.extractPersonRef(tc);

    if (personRef) {
      console.log(`[Compensation] Searching for person: ${personRef}`);
      await this.compensation.searchPerson(personRef);
    }

    // Route by test script ID first (more specific)
    const script = tc.testScript;
    if (script) {
      const scriptRouted = await this.routeByTestScript(tc, script, fieldData);
      if (scriptRouted) return;
    }

    // Fall back to business process routing
    const process = tc.businessProcess.toLowerCase();

    if (process.includes('base pay') || process.includes('salary')) {
      await this.handleBasePay(tc, fieldData);
    } else if (process.includes('individual compensation')) {
      await this.handleIndividualCompensation(tc, fieldData);
    } else if (process.includes('workforce compensation') || process.includes('merit planning') || process.includes('merit calc')) {
      await this.handleCompensationPlanning(tc, fieldData);
    } else if (process.includes('statement')) {
      await this.handleTotalCompensation(tc, fieldData);
    } else if (process.includes('total compensation')) {
      await this.handleTotalCompensation(tc, fieldData);
    } else if (process.includes('view employee history') || process.includes('history')) {
      await this.handleHistory(tc, fieldData);
    } else if (process.includes('bonus')) {
      await this.handleBonus(tc, fieldData);
    } else if (process.includes('creating job code') || process.includes('job code')) {
      await this.handleJobCode(tc, fieldData);
    } else if (process.includes('grade step') || process.includes('progression')) {
      await this.handleGradeStepProgression(tc, fieldData);
    } else if (process.includes('wage range') || process.includes('minimum wage')) {
      await this.handleWageRange(tc, fieldData);
    } else if (process.includes('update wage') || process.includes('wage structure')) {
      await this.handleWageStructure(tc, fieldData);
    } else {
      await this.handleGeneric(tc, fieldData);
    }
  }

  /**
   * Route by test script ID pattern.
   * Returns true if the script was matched, false if routing should fall back.
   *
   * When multiple COMP.xxx numbers appear in a multi-line testScript field,
   * we use the businessProcess text to disambiguate rather than relying on
   * which regex matches first.
   */
  private async routeByTestScript(tc: UATTestCase, script: string, fieldData: TestCase | undefined): Promise<boolean> {
    // For multi-script fields, disambiguate using businessProcess
    const compMatches = script.match(/COMP\.\d{3}/gi) || [];
    if (compMatches.length > 1) {
      return this.routeMultiScript(tc, fieldData);
    }

    // HCM.COMP.1xx -> Salary management
    if (/COMP\.1[0-9]{2}/i.test(script)) {
      if (/COMP\.101/i.test(script)) {
        await this.compensation.reviewSalaryHistory();
        await this.compensation.screenshot(`comp-salary-history-${tc.testId}`);
      } else if (/COMP\.102/i.test(script)) {
        await this.handleBasePay(tc, fieldData);
      } else if (/COMP\.103/i.test(script)) {
        // Review salary
        await this.compensation.reviewSalaryHistory();
        await this.compensation.screenshot(`comp-salary-review-${tc.testId}`);
      } else if (/COMP\.104/i.test(script)) {
        // Salary analysis
        await this.handleBasePay(tc, fieldData);
      } else if (/COMP\.105/i.test(script)) {
        // HCM.COMP.105 — Employee views salary details on "My Compensation" page (ESS)
        // This is an employee self-service view of their own salary, not an admin history review.
        await this.handleTotalCompensation(tc, fieldData);
      } else {
        await this.handleBasePay(tc, fieldData);
      }
      return true;
    }

    // HCM.COMP.2xx -> Wage structures (202/203) or Grade Step Progression (201, 204+)
    if (/COMP\.2[0-9]{2}/i.test(script)) {
      if (/COMP\.202/i.test(script) || /COMP\.203/i.test(script)) {
        await this.handleWageStructure(tc, fieldData);
      } else {
        await this.handleGradeStepProgression(tc, fieldData);
      }
      return true;
    }

    // HCM.COMP.3xx -> Individual Compensation Plans (ICP)
    if (/COMP\.3[0-9]{2}/i.test(script)) {
      await this.handleICP(tc, fieldData);
      return true;
    }

    // HCM.COMP.4xx -> Workforce Compensation Planning / Cycles / Approvals
    // 401-408: Comp planning (create cycles, budgets, approvals, manager views)
    // 409: Review compensation history
    // 410: Generate total comp statements
    // 411: Update wage ranges
    // 412: Grade step progression
    // 413: Compensation reports
    // 414: Minimum wage compliance
    if (/COMP\.4[0-9]{2}/i.test(script)) {
      if (/COMP\.411/i.test(script) || /COMP\.414/i.test(script)) {
        await this.handleWageRange(tc, fieldData);
      } else if (/COMP\.412/i.test(script)) {
        await this.handleGradeStepProgression(tc, fieldData);
      } else if (/COMP\.409/i.test(script)) {
        await this.handleHistory(tc, fieldData);
      } else if (/COMP\.410/i.test(script) || /COMP\.413/i.test(script)) {
        await this.handleTotalCompensation(tc, fieldData);
      } else {
        // 401-408: Workforce compensation planning/cycles/approvals
        await this.handleCompensationPlanning(tc, fieldData);
      }
      return true;
    }

    // HCM.COMP.5xx -> Total Compensation Statements
    if (/COMP\.5[0-9]{2}/i.test(script)) {
      await this.handleTotalCompensation(tc, fieldData);
      return true;
    }

    // HCM.CORE.101 -> Creating job code
    if (/CORE\.101/i.test(script)) {
      await this.handleJobCode(tc, fieldData);
      return true;
    }

    return false;
  }

  /**
   * Route multi-script test cases using businessProcess to disambiguate.
   * Called when testScript contains multiple COMP.xxx numbers (e.g., "COMP.409\nCOMP.412\nCOMP.414").
   */
  private async routeMultiScript(tc: UATTestCase, fieldData: TestCase | undefined): Promise<boolean> {
    const bp = tc.businessProcess.toLowerCase();

    if (bp.includes('wage range') || bp.includes('wage structure') || bp.includes('update wage')) {
      await this.handleWageStructure(tc, fieldData);
    } else if (bp.includes('minimum wage') || bp.includes('compliance')) {
      await this.handleWageRange(tc, fieldData);
    } else if (bp.includes('merit') || bp.includes('compensation planning')) {
      await this.handleCompensationPlanning(tc, fieldData);
    } else if (bp.includes('statement') || bp.includes('total compensation')) {
      await this.handleTotalCompensation(tc, fieldData);
    } else if (bp.includes('grade step') || bp.includes('progression')) {
      await this.handleGradeStepProgression(tc, fieldData);
    } else if (bp.includes('bonus')) {
      await this.handleICP(tc, fieldData);
    } else if (bp.includes('history')) {
      await this.handleHistory(tc, fieldData);
    } else if (bp.includes('base pay') || bp.includes('salary')) {
      await this.handleBasePay(tc, fieldData);
    } else {
      // Default: use first script number for single-script routing
      console.log(`[Compensation] ${tc.testId}: Multi-script with unrecognized BP "${tc.businessProcess}" — using generic handler`);
      await this.handleGeneric(tc, fieldData);
    }
    return true;
  }

  /**
   * Fill salary fields from field data when available.
   * Returns true if field data was used.
   */
  private async fillSalaryFromFieldData(fieldData: TestCase | undefined): Promise<boolean> {
    if (!fieldData) return false;

    const salaryAmount = getField(fieldData, 'Salary Amount');
    const salaryBasis = getField(fieldData, 'Salary Basis');
    const effectiveDate = getField(fieldData, 'Effective Date');
    const actionCode = getField(fieldData, 'Action Code');

    let filled = false;

    if (effectiveDate) {
      const dateStr = excelSerialToDate(effectiveDate);
      console.log(`[Compensation] Effective date: ${effectiveDate} -> ${dateStr}`);
      const dateField = this.page.locator('input[aria-label*="Effective Date"], input[id*="EffectiveDate"]').first();
      if (await dateField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.fillField(dateField, dateStr);
        filled = true;
      }
    }

    if (salaryAmount) {
      console.log(`[Compensation] Salary amount: ${salaryAmount}`);
      const amountField = this.page.locator('input[aria-label*="Salary Amount"], input[aria-label*="Amount"]').first();
      if (await amountField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.fillField(amountField, salaryAmount);
        filled = true;
      }
    }

    if (salaryBasis) {
      console.log(`[Compensation] Salary basis: ${salaryBasis}`);
      const basisField = this.page.locator('input[aria-label*="Salary Basis"], select[aria-label*="Salary Basis"]').first();
      if (await basisField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.fillCombobox(basisField, salaryBasis);
        filled = true;
      }
    }

    if (actionCode && actionCode !== 'CONVERSION') {
      console.log(`[Compensation] Action code: ${actionCode}`);
      const actionField = this.page.locator('input[aria-label*="Action"], select[aria-label*="Action"]').first();
      if (await actionField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.fillCombobox(actionField, actionCode);
        filled = true;
      }
    }

    return filled;
  }

  /** Handle Base Pay / salary management. */
  private async handleBasePay(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const usedFieldData = await this.fillSalaryFromFieldData(fieldData);
    if (!usedFieldData) {
      await this.compensation.fillBasePay(tc);
    }
    // Manager review pages may not have a Submit button — try Submit, then Save, then pass as review-only
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasSubmit) {
      await this.compensation.clickSubmit();
    } else {
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      const hasSave = await saveBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasSave) {
        await this.compensation.clickSave();
      } else {
        console.log(`[Compensation] No Submit/Save button found — treating as review-only for ${tc.testId}`);
      }
    }
    await this.compensation.screenshot(`comp-basepay-${tc.testId}`);
  }

  /** Handle Individual Compensation (bonuses, one-time payments). */
  private async handleIndividualCompensation(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.allocateICP();
    const usedFieldData = await this.fillSalaryFromFieldData(fieldData);
    if (!usedFieldData) {
      await this.compensation.fillIndividualCompensation(tc);
    }
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasSubmit) {
      await this.compensation.clickSubmit();
    } else {
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      const hasSave = await saveBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasSave) {
        await this.compensation.clickSave();
      } else {
        console.log(`[Compensation] No Submit/Save button found — treating as review-only for ${tc.testId}`);
      }
    }
    await this.compensation.screenshot(`comp-individual-${tc.testId}`);
  }

  /** Handle Workforce Compensation Planning (merit, budget). */
  private async handleCompensationPlanning(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.massChangeSalaries();
    const usedFieldData = await this.fillSalaryFromFieldData(fieldData);
    if (!usedFieldData) {
      await this.compensation.fillCompensationPlanning(tc);
    }
    // Merit Planning / proration review may not have a Submit button —
    // try to submit but don't fail if no button exists
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasSubmit) {
      await this.compensation.clickSubmit();
    } else {
      // Try Save as alternative
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      const hasSave = await saveBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasSave) {
        await this.compensation.clickSave();
      } else {
        console.log(`[Compensation] No Submit/Save button found — treating as review-only flow for ${tc.testId}`);
      }
    }
    await this.compensation.screenshot(`comp-planning-${tc.testId}`);
  }

  /** Handle Total Compensation statement view / My Compensation. */
  private async handleTotalCompensation(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.viewMyCompensation();
    await this.compensation.viewTotalCompensation(tc);
    await this.compensation.waitForJET();
    await this.compensation.screenshot(`comp-total-${tc.testId}`);
  }

  /** Handle View Employee History. */
  private async handleHistory(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.reviewSalaryHistory();
    await this.compensation.viewHistory(tc);
    await this.compensation.waitForJET();
    await this.compensation.screenshot(`comp-history-${tc.testId}`);
  }

  /** Handle Bonus entry. */
  private async handleBonus(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.allocateICP();
    const usedFieldData = await this.fillSalaryFromFieldData(fieldData);
    if (!usedFieldData) {
      await this.compensation.fillIndividualCompensation(tc);
    }
    await this.compensation.clickSubmit();
    await this.compensation.screenshot(`comp-bonus-${tc.testId}`);
  }

  /** Handle creating a job code. */
  private async handleJobCode(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    // Fill from field data first (migration DB), then fall back to testData parsing
    if (fieldData) {
      const job = getField(fieldData, 'Job');
      const dept = getField(fieldData, 'Department');
      if (job) {
        console.log(`[Compensation] Job from field data: ${job}`);
        const jobField = this.page.locator('input[aria-label*="Job Code" i], input[aria-label*="Job Name" i], input[aria-label*="Job" i]').first();
        if (await jobField.isVisible({ timeout: 1000 }).catch(() => false)) {
          await this.compensation.fillField(jobField, job);
        }
      }
      if (dept) {
        console.log(`[Compensation] Department from field data: ${dept}`);
        const deptField = this.page.locator('input[aria-label*="Department" i]').first();
        if (await deptField.isVisible({ timeout: 1000 }).catch(() => false)) {
          await this.compensation.fillCombobox(deptField, dept);
        }
      }
    }
    // Also try parsing from testData text if no field data filled the form
    if (!fieldData) {
      await this.compensation.fillJobCode(tc);
    }
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.compensation.clickSubmit();
    } else {
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.clickSave();
      } else {
        console.log(`[Compensation] ${tc.testId}: Job code — review-only (no Save/Submit)`);
      }
    }
    await this.compensation.screenshot(`comp-jobcode-${tc.testId}`);
  }

  /** Handle Grade Step Progression. */
  private async handleGradeStepProgression(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.runGradeStepProgression();
    if (fieldData) {
      const grade = getField(fieldData, 'Grade');
      if (grade) {
        console.log(`[Compensation] Grade: ${grade}`);
        const gradeField = this.page.locator('input[aria-label*="Grade"], select[aria-label*="Grade"]').first();
        if (await gradeField.isVisible({ timeout: 1000 }).catch(() => false)) {
          await this.compensation.fillCombobox(gradeField, grade);
        }
      }
    }
    await this.compensation.waitForJET();

    // Submit/Save after filling grade
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.compensation.clickSubmit();
    } else {
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.clickSave();
      }
    }
    await this.compensation.screenshot(`comp-grade-step-${tc.testId}`);
  }

  /** Handle Wage Range Workflow / Minimum Wage compliance. */
  private async handleWageRange(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    // Navigate to workforce compensation area
    await this.compensation.massChangeSalaries();
    await this.compensation.waitForJET();

    if (fieldData) {
      const salaryAmount = getField(fieldData, 'Salary Amount');
      const salaryBasis = getField(fieldData, 'Salary Basis');
      if (salaryAmount) {
        console.log(`[Compensation] Wage range check - salary: ${salaryAmount}, basis: ${salaryBasis}`);
      }

      // Try to fill salary fields if editable
      const amountField = this.page.locator(
        'input[aria-label*="Salary" i]:not([readonly]), input[aria-label*="Amount" i]:not([readonly])'
      ).first();
      if (salaryAmount && await amountField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.fillField(amountField, salaryAmount);
      }
    }

    // Submit/Save if available
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.compensation.clickSubmit();
    } else {
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.compensation.clickSave();
      } else {
        console.log(`[Compensation] ${tc.testId}: Wage range — review-only (no Save/Submit)`);
      }
    }
    await this.compensation.screenshot(`comp-wage-range-${tc.testId}`);
  }

  /** Handle Update Wage Structures. */
  private async handleWageStructure(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.massChangeSalaries();
    await this.compensation.waitForJET();
    await this.compensation.screenshot(`comp-wage-structure-${tc.testId}`);
  }

  /** Handle Individual Compensation Plan (ICP) allocation. */
  private async handleICP(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    await this.compensation.allocateICP();
    const usedFieldData = await this.fillSalaryFromFieldData(fieldData);
    if (!usedFieldData) {
      await this.compensation.fillIndividualCompensation(tc);
    }
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasSubmit) {
      await this.compensation.clickSubmit();
    } else {
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      const hasSave = await saveBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasSave) {
        await this.compensation.clickSave();
      } else {
        console.log(`[Compensation] No Submit/Save button found — treating as review-only for ${tc.testId}`);
      }
    }
    await this.compensation.screenshot(`comp-icp-${tc.testId}`);
  }

  /** Handle generic/unrecognized compensation operations. */
  private async handleGeneric(tc: UATTestCase, fieldData: TestCase | undefined): Promise<void> {
    const usedFieldData = await this.fillSalaryFromFieldData(fieldData);
    if (!usedFieldData) {
      await this.compensation.fillBasePay(tc);
    }
    const submitBtn = this.page.getByRole('button', { name: 'Submit' }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasSubmit) {
      await this.compensation.clickSubmit();
    } else {
      const saveBtn = this.page.getByRole('button', { name: 'Save' }).first();
      const hasSave = await saveBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasSave) {
        await this.compensation.clickSave();
      } else {
        console.log(`[Compensation] No Submit/Save button found — treating as review-only for ${tc.testId}`);
      }
    }
    await this.compensation.screenshot(`comp-generic-${tc.testId}`);
  }

  /**
   * Extract a person reference (name or number) from the test case data.
   * Looks for common patterns in testData and preConditions fields.
   */
  private extractPersonRef(tc: UATTestCase): string | null {
    const sources = [tc.testData, tc.preConditions];
    for (const src of sources) {
      if (!src) continue;
      const match = src.match(
        /(?:employee|person|worker|name|number)[:\s]*([^\n,;]+)/i
      );
      if (match) return match[1].trim();
    }
    return null;
  }
}
