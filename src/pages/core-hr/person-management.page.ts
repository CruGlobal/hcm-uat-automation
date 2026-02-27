import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Personal Details page — covers step 1 (Identification) personal fields,
 * step 2 (Person Information) address/legislative fields, and also the
 * Person Management search page for finding existing persons.
 *
 * Step 1 personal detail field indices are DYNAMIC — they change after
 * Legal Employer selection triggers a partial page refresh.
 * Use stable suffixes (it20, it60, etc.) with `.first()`.
 *
 * Person Management Search selectors:
 *   Name:          [id$="q1:value00::content"]
 *   Person Number: [id$="q1:value10::content"]
 *   National ID:   [id$="q1:value20::content"]
 *   Search btn:    [id$="q1::search"]
 */
export class PersonManagementPage extends BasePage {
  // === Person Management Search Page ===
  private readonly searchName = this.page.locator('[id$="q1:value00::content"]');
  private readonly searchPersonNumber = this.page.locator('[id$="q1:value10::content"]');
  private readonly searchNationalId = this.page.locator('[id$="q1:value20::content"]');
  private readonly searchButton = this.page.locator('[id$="q1::search"]');
  private readonly searchReset = this.page.locator('[id$="q1::reset"]');

  // === Step 1: Identification — Personal Details ===
  // These suffixes are stable but the middle index (i1:N) changes after LE selection.
  private readonly lastName = this.page.locator('input[id*="it20::content"]').first();
  private readonly firstName = this.page.locator('input[id*="it60::content"]').first();
  private readonly middleName = this.page.locator('input[id*="it24::content"]').first();
  private readonly suffix = this.page.locator('input[id*="it17::content"]').first();
  private readonly title = this.page.locator('input[id*="NewPe1"][id$="selectOneChoice4::content"]').first();
  private readonly gender = this.page.locator('[id$="soc3::content"]');
  private readonly dateOfBirth = this.page.locator('[id$="id3::content"]');

  // === Step 2: Person Information — Home Address ===
  private readonly country = this.page.locator('[id$="countrylov::content"]');
  private readonly addressLine1 = this.page.locator('[id$="inputText17::content"]').first();
  private readonly addressLine2 = this.page.locator('[id$="inputText18::content"]').first();
  private readonly zipCode = this.page.locator('[id$="inputComboboxListOfValues28::content"]').first();
  private readonly city = this.page.locator('[id$="inputComboboxListOfValues27::content"]').first();
  private readonly state = this.page.locator('[id$="inputComboboxListOfValues25::content"]').first();
  private readonly county = this.page.locator('[id$="inputComboboxListOfValues26::content"]').first();

  // === Step 2: Person Information — Legislative ===
  private readonly maritalStatus = this.page.locator('[id$="soc2::content"]');
  private readonly highestEducation = this.page.locator('[id$="hoc2::content"]');

  // === Step 1: Fill personal details ===

  async fillLastName(value: string): Promise<void> {
    await this.fillField(this.lastName, value);
  }

  async fillFirstName(value: string): Promise<void> {
    await this.fillField(this.firstName, value);
  }

  async fillMiddleName(value: string): Promise<void> {
    await this.fillField(this.middleName, value);
  }

  async fillDateOfBirth(serial: string): Promise<void> {
    await this.fillField(this.dateOfBirth, excelSerialToDate(serial));
  }

  async selectGender(value: string): Promise<void> {
    await this.fillCombobox(this.gender, value);
  }

  /** Fill step 1 personal details from test case. */
  async fillIdentificationFromTestCase(tc: TestCase): Promise<void> {
    const lastName = getField(tc, 'Last Name');
    const firstName = getField(tc, 'First Name');
    const middleName = getField(tc, 'Middle Name');
    const gender = getField(tc, 'Gender');
    const dob = getField(tc, 'Birthdate') || getField(tc, 'Date of Birth');

    if (lastName) await this.fillLastName(lastName);
    if (firstName) await this.fillFirstName(firstName);
    if (middleName) await this.fillMiddleName(middleName);
    if (gender) await this.selectGender(gender);
    if (dob) await this.fillDateOfBirth(dob);
  }

  // === Step 2: Fill address ===

  async fillAddress(tc: TestCase): Promise<void> {
    const addr1 = getField(tc, 'Address Line 1') || getField(tc, 'Address');
    const addr2 = getField(tc, 'Address Line 2');
    const zip = getField(tc, 'ZIP Code') || getField(tc, 'Zip');
    const cityVal = getField(tc, 'City');
    const stateVal = getField(tc, 'State');
    const countyVal = getField(tc, 'County');

    if (addr1) await this.fillField(this.addressLine1, addr1);
    if (addr2) await this.fillField(this.addressLine2, addr2);
    if (zip) await this.fillCombobox(this.zipCode, zip);
    if (cityVal) await this.fillCombobox(this.city, cityVal);
    if (stateVal) await this.fillCombobox(this.state, stateVal);
    if (countyVal) await this.fillCombobox(this.county, countyVal);
  }

  // === Step 2: Fill legislative info ===

  async fillLegislative(tc: TestCase): Promise<void> {
    const marital = getField(tc, 'Marital Status');
    const education = getField(tc, 'Highest Education');

    if (marital) await this.fillCombobox(this.maritalStatus, marital);
    if (education) await this.fillCombobox(this.highestEducation, education);
  }

  /** Fill all step 2 (Person Information) fields from test case. */
  async fillPersonInfoFromTestCase(tc: TestCase): Promise<void> {
    await this.fillAddress(tc);
    await this.fillLegislative(tc);
  }

  // === Person Management Search ===

  /** Search by name or number (convenience wrapper). */
  async searchPerson(query: string): Promise<void> {
    // If it looks like a number, search by person number; otherwise by name
    if (/^\d+$/.test(query.trim())) {
      await this.searchByPersonNumber(query.trim());
    } else {
      await this.searchByName(query.trim());
    }
  }

  /** Search by person name and click the first result. */
  async searchByName(name: string): Promise<void> {
    await this.searchName.fill(name);
    await this.searchButton.click();
    await this.page.waitForTimeout(8000);
    await this.waitForJET();
    await this.clickFirstSearchResult();
  }

  /** Search by person number and click the first result. */
  async searchByPersonNumber(personNumber: string): Promise<void> {
    await this.searchPersonNumber.fill(personNumber);
    await this.searchButton.click();
    await this.page.waitForTimeout(8000);
    await this.waitForJET();
    await this.clickFirstSearchResult();
  }

  /** Click the first person in search results table. */
  private async clickFirstSearchResult(): Promise<void> {
    // Search results are in a table — the first data row contains a clickable name link
    const resultLink = this.page.locator('table[id*="resId1"] tbody tr:first-child a, [id*="resId1"] [role="row"] a').first();
    const isVisible = await resultLink.isVisible({ timeout: 10000 }).catch(() => false);
    if (isVisible) {
      await resultLink.click();
      await this.page.waitForTimeout(8000);
      await this.waitForJET();
    } else {
      // Try ADF table approach
      const firstRow = this.page.locator('[id*="resId1"] tr[_afrrk]').first();
      if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstRow.click();
        await this.page.waitForTimeout(8000);
        await this.waitForJET();
      }
    }
  }
}
