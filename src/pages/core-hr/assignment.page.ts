import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import type { TestCase } from '../../data/types';

/**
 * Assignment section — part of the Employment Information step (Step 3) in the hire wizard.
 *
 * This page handles the Job, Work Relationship, and assignment-level fields.
 * Many fields are READONLY ADF comboboxes that need special handling.
 * All IDs live under the `NewPe3:0:` and `JobDe1:0:` prefixes.
 *
 * Selector patterns use `[id$="suffix"]` for stability across form variants.
 */
export class AssignmentPage extends BasePage {
  // === Work Relationship / Assignment Details ===
  private readonly businessUnit = this.page.locator('[id$="NewPe1:0:businessUnitId::content"]');
  private readonly personType = this.page.locator('[id$="NewPe1:0:selectOneChoice1::content"]');
  private readonly assignmentStatus = this.page.locator('[id$="NewPe1:0:selectOneChoice2::content"]');

  // === Job Details ===
  private readonly job = this.page.locator('[id$="JobDe1:0:jobId::content"]');
  private readonly grade = this.page.locator('[id$="JobDe1:0:gradeId::content"]');
  private readonly department = this.page.locator('[id$="JobDe1:0:departmentId::content"]');
  private readonly location = this.page.locator('[id$="JobDe1:0:locationId::content"]');
  private readonly position = this.page.locator('[id$="JobDe1:0:positionId::content"]');
  private readonly reportingEstablishment = this.page.locator('[id$="JobDe1:0:selectOneChoice7::content"]');

  // === Schedule / Category ===
  private readonly workingAtHome = this.page.locator('[id$="JobDe1:0:selectOneRadio1::content"]');
  private readonly workerCategory = this.page.locator('[id$="JobDe1:0:selectOneChoice1::content"]');
  private readonly assignmentCategory = this.page.locator('[id$="JobDe1:0:selectOneChoice3::content"]');
  private readonly regOrTemp = this.page.locator('[id$="JobDe1:0:soc2::content"]');
  private readonly fullOrPartTime = this.page.locator('[id$="JobDe1:0:soc1::content"]');
  private readonly workingAsManager = this.page.locator('[id$="JobDe1:0:selectOneRadio2::content"]');
  private readonly hourlyOrSalaried = this.page.locator('[id$="JobDe1:0:selectOneChoice2::content"]');
  private readonly workingHours = this.page.locator('[id$="JobDe1:0:inputText1::content"]');
  private readonly frequency = this.page.locator('[id$="JobDe1:0:selectOneChoice6::content"]');

  // === People Group (key flex field) ===
  private readonly peopleGroup = this.page.locator('[id$="JobDe1:0:kf2CS::content"]');

  async fillFromTestCase(tc: TestCase): Promise<void> {
    // LOV combobox fields (type + Tab)
    const comboFields: [Locator, string][] = [
      [this.businessUnit, 'Business Unit'],
      [this.job, 'Job'],
      [this.grade, 'Grade'],
      [this.department, 'Department'],
      [this.location, 'Location'],
    ];

    for (const [locator, key] of comboFields) {
      const value = getField(tc, key);
      if (value) await this.fillCombobox(locator, value);
    }

    // Readonly ADF comboboxes — use ADF setValue
    const readonlyFields: [Locator, string][] = [
      [this.personType, 'Person Type'],
      [this.assignmentStatus, 'Assignment Status'],
      [this.assignmentCategory, 'Assignment Category'],
      [this.regOrTemp, 'Reg/Temp'],
      [this.fullOrPartTime, 'Full time or Part Time'],
      [this.hourlyOrSalaried, 'Hourly Salary'],
      [this.frequency, 'Frequency'],
    ];

    for (const [locator, key] of readonlyFields) {
      const value = getField(tc, key);
      if (value) await this.setReadonlyCombobox(locator, value);
    }

    // Working at Home
    const workHome = getField(tc, 'Working at Home') || getField(tc, 'Work from Home');
    if (workHome) await this.setReadonlyCombobox(this.workingAtHome, workHome);

    // Working Hours (regular input)
    const hours = getField(tc, 'Working hours') || getField(tc, 'Working Hours');
    if (hours) await this.fillField(this.workingHours, hours);

    // People Group (Support Type + Seca Status are segments within this flex field)
    const supportType = getField(tc, 'Support Type') || getField(tc, 'PeopleGroup - Support Type');
    if (supportType) {
      // People Group is a key flex field — needs special click to expand
      // then fill individual segments
      await this.fillPeopleGroup(tc);
    }
  }

  /** Set value on a readonly ADF combobox via ADF API */
  private async setReadonlyCombobox(locator: Locator, value: string): Promise<void> {
    const fieldId = await locator.getAttribute('id');
    if (!fieldId) return;
    const isReadonly = await locator.getAttribute('readonly');
    if (isReadonly !== null) {
      // Use ADF API to set value
      const parentId = fieldId.replace('::content', '');
      await this.page.evaluate(({ pid, val }: { pid: string; val: string }) => {
        const adfPage = (window as any).AdfPage?.PAGE;
        if (!adfPage) return;
        const comp = adfPage.findComponentByAbsoluteId(pid);
        if (comp && comp.setValue) comp.setValue(val);
      }, { pid: parentId, val: value });
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    } else {
      // Not readonly — use normal combobox
      await this.fillCombobox(locator, value);
    }
  }

  /** Fill People Group flex field segments */
  private async fillPeopleGroup(tc: TestCase): Promise<void> {
    // Click the People Group field to open the key flex dialog
    const pgField = this.peopleGroup;
    const isVisible = await pgField.isVisible({ timeout: 3000 }).catch(() => false);
    if (!isVisible) return;

    // The People Group field opens a dialog with segment fields
    // For now, we'll try to click and fill
    const supportType = getField(tc, 'Support Type') || getField(tc, 'PeopleGroup - Support Type');
    const secaStatus = getField(tc, 'Seca Status') || getField(tc, 'PeopleGroup - Seca Status');

    if (supportType || secaStatus) {
      await pgField.click();
      await this.page.waitForTimeout(2000);

      // The dialog should open with segment fields
      // These are typically in a popup/dialog
      if (supportType) {
        const supportField = this.page.locator('[id*="kf2"][id*="supportType"], [id*="kf2"][id*="segment1"]').first();
        if (await supportField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await this.fillCombobox(supportField, supportType);
        }
      }
      if (secaStatus) {
        const secaField = this.page.locator('[id*="kf2"][id*="secaStatus"], [id*="kf2"][id*="segment2"]').first();
        if (await secaField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await this.fillCombobox(secaField, secaStatus);
        }
      }

      // Click OK to close the flex field dialog
      try {
        await this.clickAdfButton('OK');
      } catch {
        // Dialog may auto-close
      }
    }
  }
}
