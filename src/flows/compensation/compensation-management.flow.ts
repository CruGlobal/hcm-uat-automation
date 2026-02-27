import { type Page } from '@playwright/test';
import { BaseCompensationFlow } from './base-compensation.flow';
import type { UATTestCase } from '../../data/types';

/**
 * Flow: Compensation Management
 * Module: Workforce Compensation
 *
 * Routes to the appropriate compensation operation based on both the
 * test case's businessProcess field and the testScript ID pattern:
 *
 * Test script routing (from Cru_Workforce_Compensation_-_Test_Scripts_-_WIP.json):
 *   HCM.COMP.1xx → Salary management (101=review history, 102=change salary, etc.)
 *   HCM.COMP.2xx → Grade step progression, workforce compensation planning
 *   HCM.COMP.3xx → Individual Compensation Plans (ICP), bonuses
 *   HCM.COMP.4xx → Total compensation statements, My Compensation
 *
 * Business process routing (fallback):
 *   "Base Pay"                          → salary management
 *   "Individual Compensation"           → bonuses / one-time payments
 *   "Workforce Compensation" or
 *     "Merit Planning"                  → compensation planning
 *   "Total Compensation"               → statement view
 *   "View Employee History"            → history view
 *   "Bonuses"                          → bonus entry
 *   "creating job code"                → job setup
 */
export class CompensationManagementFlow extends BaseCompensationFlow {
  constructor(page: Page) {
    super(page);
  }

  /** Execute the compensation test case, routing by test script ID then business process. */
  async execute(tc: UATTestCase): Promise<void> {
    await this.navigateToCompensation();

    // Search for the employee if test data contains a person reference
    const personRef = this.extractPersonRef(tc);
    if (personRef) {
      await this.compensation.searchPerson(personRef);
    }

    // Route by test script ID first (more specific)
    const script = tc.testScript;
    if (script) {
      const scriptRouted = await this.routeByTestScript(tc, script);
      if (scriptRouted) return;
    }

    // Fall back to business process routing
    const process = tc.businessProcess.toLowerCase();

    if (process.includes('base pay') || process.includes('salary')) {
      await this.handleBasePay(tc);
    } else if (process.includes('individual compensation')) {
      await this.handleIndividualCompensation(tc);
    } else if (process.includes('workforce compensation') || process.includes('merit planning')) {
      await this.handleCompensationPlanning(tc);
    } else if (process.includes('total compensation')) {
      await this.handleTotalCompensation(tc);
    } else if (process.includes('view employee history') || process.includes('history')) {
      await this.handleHistory(tc);
    } else if (process.includes('bonus')) {
      await this.handleBonus(tc);
    } else if (process.includes('creating job code') || process.includes('job code')) {
      await this.handleJobCode(tc);
    } else if (process.includes('grade step') || process.includes('progression')) {
      await this.handleGradeStepProgression(tc);
    } else {
      await this.handleGeneric(tc);
    }
  }

  /**
   * Route by test script ID pattern.
   * Returns true if the script was matched, false if routing should fall back.
   */
  private async routeByTestScript(tc: UATTestCase, script: string): Promise<boolean> {
    // HCM.COMP.1xx → Salary management
    if (/COMP\.1[0-9]{2}/i.test(script)) {
      if (/COMP\.101/i.test(script)) {
        // HCM.COMP.101 - Review Employee's Salary History
        await this.compensation.reviewSalaryHistory();
        await this.compensation.screenshot(`comp-salary-history-${tc.testId}`);
      } else if (/COMP\.102/i.test(script)) {
        // HCM.COMP.102 - Change Salary
        await this.handleBasePay(tc);
      } else {
        // Other 1xx scripts - generic salary operations
        await this.handleBasePay(tc);
      }
      return true;
    }

    // HCM.COMP.2xx → Grade Step Progression / Workforce Compensation
    if (/COMP\.2[0-9]{2}/i.test(script)) {
      await this.handleGradeStepProgression(tc);
      return true;
    }

    // HCM.COMP.3xx → Individual Compensation Plans (ICP)
    if (/COMP\.3[0-9]{2}/i.test(script)) {
      await this.handleICP(tc);
      return true;
    }

    // HCM.COMP.4xx → Total Compensation / My Compensation
    if (/COMP\.4[0-9]{2}/i.test(script)) {
      await this.handleTotalCompensation(tc);
      return true;
    }

    return false;
  }

  /** Handle Base Pay / salary management. */
  private async handleBasePay(tc: UATTestCase): Promise<void> {
    await this.compensation.fillBasePay(tc);
    await this.compensation.clickSubmit();
    await this.compensation.expectSuccess();
  }

  /** Handle Individual Compensation (bonuses, one-time payments). */
  private async handleIndividualCompensation(tc: UATTestCase): Promise<void> {
    await this.compensation.fillIndividualCompensation(tc);
    await this.compensation.clickSubmit();
    await this.compensation.expectSuccess();
  }

  /** Handle Workforce Compensation Planning (merit, budget). */
  private async handleCompensationPlanning(tc: UATTestCase): Promise<void> {
    await this.compensation.massChangeSalaries();
    await this.compensation.fillCompensationPlanning(tc);
    await this.compensation.clickSubmit();
    await this.compensation.expectSuccess();
  }

  /** Handle Total Compensation statement view / My Compensation. */
  private async handleTotalCompensation(tc: UATTestCase): Promise<void> {
    await this.compensation.viewMyCompensation();
    await this.compensation.viewTotalCompensation(tc);
    await this.compensation.waitForJET();
  }

  /** Handle View Employee History. */
  private async handleHistory(tc: UATTestCase): Promise<void> {
    await this.compensation.reviewSalaryHistory();
    await this.compensation.viewHistory(tc);
    await this.compensation.waitForJET();
  }

  /** Handle Bonus entry. */
  private async handleBonus(tc: UATTestCase): Promise<void> {
    await this.compensation.fillIndividualCompensation(tc);
    await this.compensation.clickSubmit();
    await this.compensation.expectSuccess();
  }

  /** Handle creating a job code. */
  private async handleJobCode(tc: UATTestCase): Promise<void> {
    await this.compensation.fillJobCode(tc);
    await this.compensation.clickSubmit();
    await this.compensation.expectSuccess();
  }

  /** Handle Grade Step Progression. */
  private async handleGradeStepProgression(tc: UATTestCase): Promise<void> {
    await this.compensation.runGradeStepProgression();
    await this.compensation.waitForJET();
    await this.compensation.screenshot(`comp-grade-step-${tc.testId}`);
  }

  /** Handle Individual Compensation Plan (ICP) allocation. */
  private async handleICP(tc: UATTestCase): Promise<void> {
    await this.compensation.allocateICP();
    await this.compensation.fillIndividualCompensation(tc);
    await this.compensation.clickSubmit();
    await this.compensation.expectSuccess();
  }

  /** Handle generic/unrecognized compensation operations. */
  private async handleGeneric(tc: UATTestCase): Promise<void> {
    await this.compensation.fillBasePay(tc);
    await this.compensation.clickSubmit();
    await this.compensation.expectSuccess();
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
