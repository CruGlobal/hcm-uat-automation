import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { getField } from '../../data/test-data-provider';
import { excelSerialToDate } from '../../utils/oracle-hcm-helpers';
import type { TestCase } from '../../data/types';

/**
 * Person Management page — personal details, addresses, legislative info.
 * Covers the "Personal Details", "Addresses", and "Legislative" sections of the hire forms.
 */
export class PersonManagementPage extends BasePage {
  // Personal Details
  private readonly lastName = this.page.locator('input[aria-label*="Last Name"], input[id*="LastName"]').first();
  private readonly firstName = this.page.locator('input[aria-label*="First Name"], input[id*="FirstName"]').first();
  private readonly birthdate = this.page.locator('input[aria-label*="Date of Birth"], input[id*="Birthdate"], input[id*="DateOfBirth"]').first();
  private readonly nationalIdType = this.page.locator('select[aria-label*="National ID Type"], [id*="NationalIdType"]').first();
  private readonly nationalId = this.page.locator('input[aria-label*="National ID"], input[id*="NationalId"]').first();

  // Addresses
  private readonly homeAddress = this.page.locator('[aria-label*="Home Address"], [id*="HomeAddress"]').first();
  private readonly workAddress = this.page.locator('[aria-label*="Work Address"], [id*="WorkAddress"]').first();

  // Legislative
  private readonly maritalStatus = this.page.locator('select[aria-label*="Marital Status"], [id*="MaritalStatus"]').first();
  private readonly gender = this.page.locator('select[aria-label*="Gender"], [id*="Gender"]').first();

  async fillLastName(value: string): Promise<void> {
    await this.fillField(this.lastName, value);
  }

  async fillFirstName(value: string): Promise<void> {
    await this.fillField(this.firstName, value);
  }

  async fillBirthdate(serial: string): Promise<void> {
    await this.fillField(this.birthdate, excelSerialToDate(serial));
  }

  async fillNationalId(type: string, id: string): Promise<void> {
    if (type) {
      await this.selectValue(this.nationalIdType, type);
    }
    if (id) {
      await this.fillField(this.nationalId, id);
    }
  }

  async selectMaritalStatus(value: string): Promise<void> {
    await this.selectValue(this.maritalStatus, value);
  }

  async selectGender(value: string): Promise<void> {
    await this.selectValue(this.gender, value);
  }

  /** Fill all personal detail fields from test case data. */
  async fillFromTestCase(tc: TestCase): Promise<void> {
    const lastName = getField(tc, 'Last Name');
    const firstName = getField(tc, 'First Name');
    const birthdate = getField(tc, 'Birthdate');
    const nationalIdType = getField(tc, 'National ID Type');
    const nationalId = getField(tc, 'National ID');
    const maritalStatus = getField(tc, 'Marital Status');
    const gender = getField(tc, 'Gender');

    if (lastName) await this.fillLastName(lastName);
    if (firstName) await this.fillFirstName(firstName);
    if (birthdate) await this.fillBirthdate(birthdate);
    if (nationalIdType || nationalId) await this.fillNationalId(nationalIdType, nationalId);
    if (maritalStatus) await this.selectMaritalStatus(maritalStatus);
    if (gender) await this.selectGender(gender);
  }

  // --- private helpers ---

  private async fillField(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
    await locator.press('Tab');
    await this.waitForJET();
  }

  private async selectValue(locator: ReturnType<Page['locator']>, value: string): Promise<void> {
    await locator.click();
    await this.page.locator(`oj-option:has-text("${value}"), li[role="option"]:has-text("${value}")`).first().click();
    await this.waitForJET();
  }
}
