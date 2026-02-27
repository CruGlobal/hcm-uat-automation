import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { BenefitsPage } from '../../pages/benefits/benefits.page';
import type { UATTestCase } from '../../data/types';

/**
 * Base flow for all Benefits module actions.
 * Composes the BenefitsPage and HomePage page objects.
 *
 * Handles:
 *   - Login and navigation to Benefits (admin vs ESS)
 *   - Person search in the Activity Center
 *   - Common data extraction helpers for test case fields
 */
export class BaseBenefitsFlow extends BaseFlow {
  protected benefits: BenefitsPage;

  constructor(page: Page) {
    super(page);
    this.benefits = new BenefitsPage(page);
  }

  /** Login and navigate to the Benefits module via Navigator. */
  async loginAndNavigateToBenefits(): Promise<void> {
    await this.loginToHCM();
    await this.homePage.openNavigator();
    await this.benefits.navigateToBenefits();
  }

  /**
   * Login and navigate to Benefits Activity Center (Admin).
   * Uses the deep link to the Redwood Activity Center page.
   */
  async loginAndNavigateToBenefitsAdmin(): Promise<void> {
    await this.loginToHCM();
    await this.benefits.navigateToBenefitsAdmin();
  }

  /**
   * Login and navigate to Employee Self-Service Benefits enrollment summary.
   * Uses the deep link to the Redwood ESS enrollment page.
   */
  async loginAndNavigateToSelfService(): Promise<void> {
    await this.loginToHCM();
    await this.benefits.navigateToSelfServiceBenefits();
  }

  /**
   * Search for a person in the admin Benefits Activity Center.
   * Extracts the person identifier from the test case testData or preConditions
   * and enters it into the search combobox.
   */
  async searchForPerson(tc: UATTestCase): Promise<void> {
    const personIdentifier = this.extractPersonIdentifier(tc);
    if (personIdentifier) {
      await this.benefits.searchPerson(personIdentifier);
    }
  }

  /**
   * Search for and select a person in the admin Activity Center.
   * Performs the search then clicks the matching worker card in results.
   */
  async searchAndSelectPerson(tc: UATTestCase): Promise<void> {
    const personIdentifier = this.extractPersonIdentifier(tc);
    if (personIdentifier) {
      await this.benefits.searchPerson(personIdentifier);
      await this.benefits.selectWorker(personIdentifier);
    }
  }

  /**
   * Extract a person name or number from the test case data fields.
   * Checks testData and preConditions for person references.
   */
  protected extractPersonIdentifier(tc: UATTestCase): string | null {
    // Look for person number pattern (e.g. "Person Number: 12345")
    const numberMatch = tc.testData.match(/(?:person\s*(?:number|#|no))\s*[:\-]?\s*(\S+)/i)
      || tc.preConditions.match(/(?:person\s*(?:number|#|no))\s*[:\-]?\s*(\S+)/i);
    if (numberMatch) return numberMatch[1];

    // Look for employee name pattern
    const nameMatch = tc.testData.match(/(?:employee|person|name)\s*[:\-]?\s*([A-Za-z]+\s+[A-Za-z]+)/i)
      || tc.preConditions.match(/(?:employee|person|name)\s*[:\-]?\s*([A-Za-z]+\s+[A-Za-z]+)/i);
    if (nameMatch) return nameMatch[1];

    return null;
  }

  /**
   * Extract a date from the test case data fields.
   * Checks testData and preConditions for a date pattern associated with the given label.
   */
  protected extractDate(tc: UATTestCase, label: string): string | null {
    const pattern = new RegExp(`${label}\\s*[:\\-]?\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})`, 'i');
    const match = tc.testData.match(pattern) || tc.preConditions.match(pattern);
    return match ? match[1] : null;
  }

  /**
   * Extract life event type from test case data.
   * Scans testData, testScenario, and businessProcess for known event type keywords.
   */
  protected extractLifeEventType(tc: UATTestCase): string | null {
    const data = `${tc.testData} ${tc.testScenario} ${tc.businessProcess}`;
    const eventTypes = [
      'Marriage', 'Divorce', 'Birth', 'Adoption', 'Death',
      'Loss of Coverage', 'Gain of Coverage', 'Address Change',
      'Employment Change', 'Qualifying Life Event',
    ];
    for (const event of eventTypes) {
      if (data.toLowerCase().includes(event.toLowerCase())) {
        return event;
      }
    }
    return null;
  }

  /**
   * Extract plan types mentioned in the test case data.
   * Returns an array of plan type strings found in the combined test data fields.
   */
  protected extractPlanTypes(tc: UATTestCase): string[] {
    const data = `${tc.testData} ${tc.testScenario} ${tc.businessProcess}`.toLowerCase();
    const planTypes = ['medical', 'dental', 'vision', 'life', 'ltd', '403b', '401k'];
    return planTypes.filter(plan => data.includes(plan));
  }

  /**
   * Extract coverage level from the test case data.
   * Returns the first matching coverage level string, or null.
   */
  protected extractCoverageLevel(tc: UATTestCase): string | null {
    const data = `${tc.testData} ${tc.testScenario} ${tc.businessProcess}`.toLowerCase();
    const coverageLevels = [
      'employee only', 'employee + spouse', 'employee + family',
      'employee + child', 'employee + children',
    ];
    for (const level of coverageLevels) {
      if (data.includes(level)) {
        return level;
      }
    }
    return null;
  }
}
