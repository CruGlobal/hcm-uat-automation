import { BasePage } from '../base.page';
import { HomePage } from '../home.page';
import { PersonManagementPage } from './person-management.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Staff Account and Designation section — Cru-specific EIT fields.
 *
 * Two usage modes:
 * 1. **In-wizard** (fillFromTestCase): Fills Staff Designation on wizard Step 4/5.
 *    Used by AddPendingWorkerFlow, PendingToHireFlow during the wizard.
 * 2. **Post-submission** (createPostSubmissionEIT): After wizard submission,
 *    navigates to Person Management → Extra Information → Staff Account and Designation
 *    to create the EIT record via the Person Management UI.
 *
 * Fields: Effective Date, Staff Account Number, Designation Number, Primary Person.
 * REST API context: PersonExtraInformationContextStaff__Account__and__DesignationprivateVO
 *
 * Person Management EIT selectors (discovered via live inspection):
 * - Extra Information tab: `a` with text "Extra Information"
 * - Staff Designation link: `[id*="PER_EITStaff__Account__and__Designation"]`
 * - Edit dropdown: `[id*="editDropDown::icon"]` → "Update" / "Correct" menu items
 * - Staff Account Number: `input[id*="staffAccountNumber::content"]`
 * - Designation Number: `input[id*="designationNumber::content"]`
 * - Primary Person: `input[id*="primaryPerson_Display::content"]`
 * - Save: top-level "Save" button, Submit: top-level "Submit" button
 */
export class StaffDesignationPage extends BasePage {

  /**
   * Fill Staff Account and Designation fields from test case data.
   * Scrolls the section into view, clicks Add if needed, then fills fields.
   */
  async fillFromTestCase(tc: TestCase): Promise<void> {
    const effDate = getField(tc, 'Staff and Designation > Effective Date');
    const staffAcct = getField(tc, 'Staff Account Number');
    const designation = getField(tc, 'Staff and Designation > Designation');
    const primary = getField(tc, 'Staff and Designation > Primary');

    // If no Staff Designation data, skip
    if (!staffAcct && !designation) return;

    // Try to find and expand the Staff Account and Designation section
    const sectionFound = await this.expandSection();
    if (!sectionFound) {
      console.log('[StaffDesignation] Section not found on page — skipping');
      return;
    }

    // Click "Add" button if present (EIT sections often require creating a new row)
    await this.clickAddIfNeeded();

    // Fill Effective Date
    if (effDate) {
      const dateStr = this.resolveDate(effDate);
      const dateField = this.page.locator(
        'input[id*="staffEffectiveDate"], input[id*="StaffEffectiveDate"], ' +
        'input[id*="EffectiveStartDate"][id*="taff"], input[aria-label*="Effective Date"]'
      ).first();
      const dateVisible = await dateField.isVisible({ timeout: 5000 }).catch(() => false);
      if (dateVisible) {
        await this.fillField(dateField, dateStr);
      }
    }

    // Fill Staff Account Number
    if (staffAcct) {
      const staffField = this.page.locator(
        'input[id*="staffAccountNumber"], input[id*="StaffAccount"], ' +
        'input[id*="staffAccount"], input[aria-label*="Staff Account"]'
      ).first();
      const staffVisible = await staffField.isVisible({ timeout: 5000 }).catch(() => false);
      if (staffVisible) {
        await this.fillField(staffField, staffAcct);
      } else {
        console.log('[StaffDesignation] Staff Account Number field not found');
      }
    }

    // Fill Designation Number
    if (designation) {
      const desigField = this.page.locator(
        'input[id*="designationNumber"], input[id*="Designation"], ' +
        'input[id*="designation"], input[aria-label*="Designation"]'
      ).first();
      const desigVisible = await desigField.isVisible({ timeout: 5000 }).catch(() => false);
      if (desigVisible) {
        await this.fillField(desigField, designation);
      } else {
        console.log('[StaffDesignation] Designation field not found');
      }
    }

    // Fill Primary Person (Yes/No dropdown or checkbox)
    if (primary) {
      const primaryField = this.page.locator(
        'select[id*="primaryPerson"], select[id*="PrimaryPerson"], ' +
        'input[id*="primaryPerson"], select[aria-label*="Primary"], ' +
        'input[id*="primary"], input[aria-label*="Primary"]'
      ).first();
      const primaryVisible = await primaryField.isVisible({ timeout: 3000 }).catch(() => false);
      if (primaryVisible) {
        const tagName = await primaryField.evaluate(el => el.tagName.toLowerCase()).catch(() => 'input');
        if (tagName === 'select') {
          const val = primary.toLowerCase().startsWith('y') ? 'Y' : 'N';
          await this.fillCombobox(primaryField, val);
        } else {
          await this.fillField(primaryField, primary);
        }
      }
    }

    console.log('[StaffDesignation] Filled Staff Account and Designation fields');
  }

  /** Fill training status rows if present. */
  async fillTraining(tc: TestCase): Promise<void> {
    const type = getField(tc, 'Training Status > Type');
    if (!type) return;

    const course = getField(tc, 'Training Status > Course');
    const status = getField(tc, 'Training Status > Status');

    const types = type.split(',').map((s) => s.trim());
    const courses = course ? course.split(',').map((s) => s.trim()) : [];
    const statuses = status ? status.split(',').map((s) => s.trim()) : [];

    for (let i = 0; i < types.length; i++) {
      const rowLocator = this.page.locator(
        `table[id*="TrainingStatus"] tbody tr:nth-child(${i + 1}), ` +
        `table[id*="training"] tbody tr:nth-child(${i + 1}), ` +
        `[id*="training"] tr[_afrrk="${i}"]`
      ).first();

      const rowVisible = await rowLocator.isVisible({ timeout: 3000 }).catch(() => false);
      if (!rowVisible) {
        console.log(`[StaffDesignation] Training row ${i} not visible — skipping`);
        continue;
      }

      if (types[i]) {
        const typeInput = rowLocator.locator('select, [id*="Type"]').first();
        await this.fillCombobox(typeInput, types[i]);
      }
      if (courses[i]) {
        const courseInput = rowLocator.locator('input[id*="Course"], input[id*="course"]').first();
        await this.fillField(courseInput, courses[i]);
      }
      if (statuses[i]) {
        const statusInput = rowLocator.locator('select[id*="Status"], select[id*="status"]').first();
        await this.fillCombobox(statusInput, statuses[i]);
      }
    }
  }

  /**
   * Try to find and expand the Staff Account and Designation section.
   */
  private async expandSection(): Promise<boolean> {
    const sectionHeader = this.page.getByText('Staff Account and Designation', { exact: false }).first();
    const headerVisible = await sectionHeader.isVisible({ timeout: 5000 }).catch(() => false);

    if (headerVisible) {
      await sectionHeader.scrollIntoViewIfNeeded().catch(() => {});
      await this.page.waitForTimeout(1000);

      // If the header is a disclosure/expandable link, click to expand
      const isLink = await sectionHeader.evaluate(el => {
        const a = el.closest('a') || el.querySelector('a');
        return !!a;
      }).catch(() => false);
      if (isLink) {
        await sectionHeader.click().catch(() => {});
        await this.page.waitForTimeout(2000);
        await this.waitForJET();
      }
      return true;
    }

    // Fallback: look for any EIT/Extra Information section
    const extraInfoHeader = this.page.getByText('Extra Information', { exact: false }).first();
    const extraVisible = await extraInfoHeader.isVisible({ timeout: 3000 }).catch(() => false);
    if (extraVisible) {
      await extraInfoHeader.scrollIntoViewIfNeeded().catch(() => {});
      return true;
    }

    return false;
  }

  /**
   * Click the "Add" button to create a new EIT row if needed.
   */
  private async clickAddIfNeeded(): Promise<void> {
    const addBtn = this.page.locator(
      'a[title="Add Row"], button[title="Add Row"], ' +
      'a[title="Create"], button[title="Create"], ' +
      'img[title="Add Row"], a[id*="::add"], [id*="Create"]'
    ).first();

    const addVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (addVisible) {
      console.log('[StaffDesignation] Clicking Add button to create new EIT row');
      await addBtn.click({ force: true });
      await this.page.waitForTimeout(3000);
      await this.waitForJET();
    }
  }

  /**
   * Navigate to Person Management, find the person, and create a Staff Designation EIT record.
   * Called after wizard submission when person number is available.
   *
   * Navigation: Person Management → search by person number → click person →
   *   More Information → Personal and Employment → Person →
   *   Extra Information tab → Staff Account and Designation → Edit → Update →
   *   fill fields → Save
   *
   * @param personNumber - The person number from wizard confirmation
   * @param tc - TestCase with Staff Designation field data
   * @returns true if EIT was created successfully, false if skipped/failed
   */
  async createPostSubmissionEIT(personNumber: string, tc: TestCase): Promise<boolean> {
    const staffAcct = getField(tc, 'Staff Account Number');
    const designation = getField(tc, 'Designation');
    if (!staffAcct && !designation) return false;

    const homePage = new HomePage(this.page);
    const personMgmt = new PersonManagementPage(this.page);

    try {
      console.log(`[StaffDesignation-EIT] Creating EIT for person ${personNumber}`);

      // Navigate home first (post-wizard page may not have Navigator available)
      await homePage.goHome();

      // Navigate to Person Management and search
      await homePage.goToPersonManagement();
      await personMgmt.searchByPersonNumber(personNumber);

      // searchByPersonNumber clicks the first result, landing on Employment detail.
      // Navigate: More Information → Personal and Employment → Person
      await this.navigateToPersonDetail();

      // Click "Extra Information" tab
      const extraInfoTab = this.page.locator('a, [role="tab"]').filter({ hasText: /^Extra Information$/ }).first();
      const tabVisible = await extraInfoTab.isVisible({ timeout: 8000 }).catch(() => false);
      if (!tabVisible) {
        console.log('[StaffDesignation-EIT] Extra Information tab not found');
        return false;
      }
      await this.clearGlassPane();
      await extraInfoTab.click({ force: true });
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      await this.clearGlassPane();

      // Click "Staff Account and Designation" in the left sidebar
      const staffLink = this.page.locator('[id*="PER_EITStaff__Account__and__Designation"]').first();
      const staffLinkVisible = await staffLink.isVisible({ timeout: 5000 }).catch(() => false);
      if (!staffLinkVisible) {
        console.log('[StaffDesignation-EIT] Staff Account and Designation link not found in sidebar');
        return false;
      }
      await this.clearGlassPane();
      await staffLink.click({ force: true });
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
      await this.clearGlassPane();

      // Click Edit dropdown → "Update" to create a new effective-dated record
      // (for new persons with no existing record, this creates the first row;
      //  for existing persons, this creates a new effective-dated row)
      const editIcon = this.page.locator('[id*="editDropDown::icon"]').first();
      const editVisible = await editIcon.isVisible({ timeout: 5000 }).catch(() => false);
      if (!editVisible) {
        console.log('[StaffDesignation-EIT] Edit dropdown not found');
        return false;
      }
      await this.clearGlassPane();
      await editIcon.click({ force: true });
      await this.page.waitForTimeout(3000);

      // Click "Update" from the dropdown menu
      const updateItem = this.page.locator('tr[id*="updateEFF"], td:has-text("Update")').first();
      const correctItem = this.page.locator('tr[id*="correctEFF"], td:has-text("Correct")').first();
      const updateVisible = await updateItem.isVisible({ timeout: 3000 }).catch(() => false);
      const correctVisible = await correctItem.isVisible({ timeout: 2000 }).catch(() => false);

      if (updateVisible) {
        await updateItem.click({ force: true });
        console.log('[StaffDesignation-EIT] Clicked "Update"');
      } else if (correctVisible) {
        await correctItem.click({ force: true });
        console.log('[StaffDesignation-EIT] Clicked "Correct" (Update not available)');
      } else {
        console.log('[StaffDesignation-EIT] No edit menu items found');
        return false;
      }
      await this.page.waitForTimeout(5000);
      await this.waitForJET();
      await this.clearGlassPane();

      // Handle potential "Effective Date" dialog that appears for "Update" mode
      await this.handleEffectiveDateDialog(tc);

      // Fill Staff Account Number
      if (staffAcct) {
        const staffField = this.page.locator('input[id*="staffAccountNumber::content"]').first();
        const vis = await staffField.isVisible({ timeout: 5000 }).catch(() => false);
        if (vis) {
          await this.fillField(staffField, staffAcct);
          console.log(`[StaffDesignation-EIT] Staff Account Number: ${staffAcct}`);
        }
      }

      // Fill Designation Number
      if (designation) {
        const desigField = this.page.locator('input[id*="designationNumber::content"]').first();
        const vis = await desigField.isVisible({ timeout: 5000 }).catch(() => false);
        if (vis) {
          await this.fillField(desigField, designation);
          console.log(`[StaffDesignation-EIT] Designation Number: ${designation}`);
        }
      }

      // Fill Primary Person
      const primary = getField(tc, 'Primary');
      if (primary) {
        const primaryField = this.page.locator('input[id*="primaryPerson_Display::content"]').first();
        const vis = await primaryField.isVisible({ timeout: 3000 }).catch(() => false);
        if (vis) {
          const val = primary.toLowerCase().startsWith('y') ? 'Yes' : 'No';
          await this.fillCombobox(primaryField, val);
          console.log(`[StaffDesignation-EIT] Primary Person: ${val}`);
        }
      }

      // Save
      await this.clickAdfButton('Save');
      await this.page.waitForTimeout(5000);
      await this.waitForJET();

      // Check for errors
      const errorDialog = this.page.locator('.x24d, [id*="msgDlg"]').first();
      const hasError = await errorDialog.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasError) {
        const errorText = await errorDialog.textContent().catch(() => '') || '';
        console.log(`[StaffDesignation-EIT] Error after save: ${errorText.substring(0, 200)}`);
        await this.dismissErrorDialog();
        return false;
      }

      console.log('[StaffDesignation-EIT] Successfully saved Staff Designation EIT');
      return true;
    } catch (error) {
      console.log(`[StaffDesignation-EIT] Failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Navigate from Employment detail page to Person detail page.
   * Path: More Information → Personal and Employment → Person
   */
  private async navigateToPersonDetail(): Promise<void> {
    const moreInfoLink = this.page.locator('a[title="More Information"]').first();
    const hasMoreInfo = await moreInfoLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasMoreInfo) {
      // May already be on Person detail page (Extra Information tab visible)
      return;
    }

    await this.clearGlassPane();
    await moreInfoLink.click({ force: true });
    await this.page.waitForTimeout(3000);

    const personalEmpLink = this.page.locator('a:has-text("Personal and Employment")').first();
    if (await personalEmpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await personalEmpLink.click({ force: true });
      await this.page.waitForTimeout(2000);
    }

    // Click "Person" quick action — try known ADF ID first, fallback to text
    const personAction = this.page.locator('[id$="dci12:16:cml13"]').first();
    if (await personAction.isVisible({ timeout: 5000 }).catch(() => false)) {
      await personAction.click({ force: true });
    } else {
      // Broader fallback: look for "Person" link in the popup
      const personLinks = this.page.locator('a').filter({ hasText: /^Person$/ });
      const count = await personLinks.count();
      for (let i = 0; i < count; i++) {
        const link = personLinks.nth(i);
        const rect = await link.boundingBox().catch(() => null);
        // Pick links that are in a popup/dropdown area (not the top header)
        if (rect && rect.y > 200) {
          await link.click({ force: true });
          break;
        }
      }
    }

    await this.page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await this.page.waitForTimeout(10000);
    await this.waitForJET();
    await this.clearGlassPane();
  }

  /**
   * Handle the Effective Date dialog that may appear when clicking "Update".
   * Oracle HCM prompts for an effective date when creating a new effective-dated EIT row.
   */
  private async handleEffectiveDateDialog(tc: TestCase): Promise<void> {
    // Check if a date input appeared (dialog or inline prompt)
    const dateInput = this.page.locator(
      'input[id*="EffectiveStartDate"], input[id*="effectiveStartDate"], ' +
      'input[id*="effStartDate"], input[aria-label*="Effective"]'
    ).first();
    const dateVisible = await dateInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (dateVisible) {
      const effDate = getField(tc, 'Effective Date') || getField(tc, 'Staff and Designation > Effective Date');
      const dateStr = effDate ? this.resolveDate(effDate) : this.resolveDate('todays date');
      await this.fillField(dateInput, dateStr);
      console.log(`[StaffDesignation-EIT] Effective Date: ${dateStr}`);

      // Click OK/Continue if dialog
      const okBtn = this.page.getByRole('button', { name: 'OK' }).first();
      if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await okBtn.click();
        await this.page.waitForTimeout(5000);
        await this.waitForJET();
        await this.clearGlassPane();
      }
    }
  }

  /**
   * Resolve date value — handles "todays date", Excel serial numbers, and passthrough.
   */
  private resolveDate(value: string): string {
    const lower = value.toLowerCase().replace(/['']/g, "'");
    if (lower === 'todays date' || lower === "today's date" || lower === 'today') {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      return `${mm}/${dd}/${now.getFullYear()}`;
    }
    return excelSerialToDate(value);
  }
}
