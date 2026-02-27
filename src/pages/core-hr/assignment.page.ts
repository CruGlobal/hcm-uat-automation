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
  /**
   * Migration DB values that don't match Oracle HCM LOV values.
   * The migration DB uses codes/placeholders; the LOV expects display names.
   */
  private readonly lovValueMapping: Record<string, Record<string, string>> = {
    'Location': {
      'CRU_HQ': 'Cru World Headquarters',
    },
  };

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
    // LOV combobox fields — use fillLovField to properly handle "Search and Select" dialogs.
    // fillCombobox leaves text in the field but ADF doesn't register it as a valid selection.
    const lovFields: [Locator, string][] = [
      [this.businessUnit, 'Business Unit'],
      [this.job, 'Job'],
      [this.grade, 'Grade'],
      [this.department, 'Department'],
      [this.location, 'Location'],
    ];

    for (const [locator, key] of lovFields) {
      let value = getField(tc, key);
      if (value) {
        // Apply value mapping for migration→HCM translations
        const mapped = this.lovValueMapping[key]?.[value];
        if (mapped) {
          console.log(`[Assignment] Mapped LOV ${key}: "${value}" → "${mapped}"`);
          value = mapped;
        }
        console.log(`[Assignment] Filling LOV ${key} = "${value}"`);
        await this.fillLovField(locator, value);
        const afterValue = await locator.inputValue().catch(() => '(no value)');
        console.log(`[Assignment] ${key} after fill: "${afterValue}"`);
      }
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
      if (value) {
        console.log(`[Assignment] Setting readonly ${key} = "${value}"`);
        await this.setReadonlyCombobox(locator, value);
        const afterValue = await locator.inputValue().catch(() => '(no value)');
        console.log(`[Assignment] ${key} after set: "${afterValue}"`);
      }
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

  /**
   * Set value on an ADF dropdown/combobox via ADF API.
   * Always tries ADF API first (works for both <select> and <input readonly>).
   * Falls back to fillCombobox only if ADF component not found.
   */
  private async setReadonlyCombobox(locator: Locator, value: string): Promise<void> {
    const fieldId = await locator.getAttribute('id').catch(() => null);
    if (!fieldId) {
      console.log(`[ADF] setReadonlyCombobox: locator has no id, skipping "${value}"`);
      return;
    }
    const parentId = fieldId.replace('::content', '');

    // Determine tag name — <select> elements need Playwright selectOption, not ADF API
    const tagName = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
    console.log(`[ADF] setReadonlyCombobox: id=${fieldId}, tag=${tagName}, value="${value}"`);

    if (tagName === 'select') {
      // Use native selectOption with label matching (handles case differences)
      // First get the option labels to find the best match
      const options = await locator.evaluate((el) => {
        return Array.from((el as HTMLSelectElement).options).map(o => ({
          label: o.text.trim(),
          value: o.value,
        }));
      });
      const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
      const normalizedVal = normalize(value);
      const match = options.find(o => o.label === value)
        || options.find(o => normalize(o.label) === normalizedVal)
        || options.find(o => normalize(o.label).includes(normalizedVal) || normalizedVal.includes(normalize(o.label)));
      if (match) {
        await locator.selectOption(match.value);
        console.log(`[ADF] selectOption(${parentId}, "${value}"): selected "${match.label}" (value=${match.value})`);
      } else {
        console.log(`[ADF] selectOption(${parentId}, "${value}"): no match in options: ${options.map(o => o.label).join(', ')}`);
      }
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
      return;
    }

    // For <input readonly> and other non-select elements — use ADF API
    const result = await this.page.evaluate(({ pid, val }: { pid: string; val: string }) => {
      const adfPage = (window as any).AdfPage?.PAGE;
      if (!adfPage) return { success: false, reason: 'no AdfPage' };
      const comp = adfPage.findComponentByAbsoluteId(pid);
      if (!comp) return { success: false, reason: `component not found: ${pid}` };

      const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
      const normalizedVal = normalize(val);
      const items = comp.getSelectItems?.();
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].getLabel?.() === val || items[i].getValue?.() === val) {
            comp.setValue(items[i].getValue());
            return { success: true, matched: 'exact' };
          }
        }
        for (let i = 0; i < items.length; i++) {
          const normalizedLabel = normalize(items[i].getLabel?.() || '');
          if (normalizedLabel === normalizedVal || normalizedLabel.includes(normalizedVal) || normalizedVal.includes(normalizedLabel)) {
            comp.setValue(items[i].getValue());
            return { success: true, matched: 'normalized' };
          }
        }
        return { success: false, reason: 'no match found' };
      }
      comp.setValue(val);
      return { success: true, matched: 'fallback' };
    }, { pid: parentId, val: value });

    const success = result.success;

    if (success) {
      await this.page.waitForTimeout(2000);
      await this.waitForJET();
    } else {
      // ADF component not found — try normal combobox
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
