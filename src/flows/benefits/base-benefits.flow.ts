import { type Page } from '@playwright/test';
import { BaseFlow } from '../base.flow';
import { BenefitsPage } from '../../pages/benefits/benefits.page';
import { getFieldData } from '../../data/uat-plan-provider';
import { getField } from '../../data/test-data-provider';
import type { UATTestCase, TestCase } from '../../data/types';

/**
 * Base flow for all Benefits module actions.
 * Composes the BenefitsPage and HomePage page objects.
 *
 * Handles:
 *   - Login and navigation to Benefits (admin vs ESS)
 *   - Person search in the Activity Center using field data
 *   - Common data extraction helpers from both UATTestCase metadata and TestCase field data
 *   - Error handling with screenshots on failure
 *   - "No benefits relationship" detection and graceful handling
 */
export class BaseBenefitsFlow extends BaseFlow {
  protected benefits: BenefitsPage;

  constructor(page: Page) {
    super(page);
    this.benefits = new BenefitsPage(page);
  }

  /** Login and navigate to the Benefits module. */
  async loginAndNavigateToBenefits(tc?: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);
    await this.benefits.navigateToBenefits();
  }

  /**
   * Login and navigate to Benefits Activity Center (Admin).
   * Uses the deep link to the Redwood Activity Center page.
   */
  async loginAndNavigateToBenefitsAdmin(tc?: UATTestCase): Promise<void> {
    await this.loginToHCM(tc);
    await this.benefits.navigateToBenefitsAdmin();
  }

  /**
   * Login and navigate to Employee Self-Service Benefits enrollment summary.
   * For ESS tests with field data, logs in as the target employee (so they
   * see their own benefits/enrollment plans). Falls back to bot login.
   */
  async loginAndNavigateToSelfService(tc?: UATTestCase): Promise<void> {
    if (tc) {
      await this.loginAsTargetEmployeeOrBot(tc);
    } else {
      await this.loginToHCM(tc);
    }
    await this.benefits.navigateToSelfServiceBenefits();
  }

  /**
   * Try to login as the target employee from field data.
   * If no person number or provisioning fails, falls back to bot login.
   */
  private async loginAsTargetEmployeeOrBot(tc: UATTestCase): Promise<void> {
    const personNumber = this.getPersonNumber(tc);
    if (personNumber) {
      try {
        await this.loginAsEmployee(personNumber, tc.testId);
        return;
      } catch (err) {
        console.warn(`[Benefits] ${tc.testId}: Could not login as employee ${personNumber}, falling back to bot: ${err}`);
      }
    }
    await this.loginToHCM(tc);
  }

  /**
   * Search for a person in the admin Benefits Activity Center.
   * Prefers field data (Person Number or Person Name) over regex-parsed testData.
   */
  async searchForPerson(tc: UATTestCase): Promise<void> {
    const personIdentifier = this.getPersonIdentifier(tc);
    if (personIdentifier) {
      await this.benefits.searchPerson(personIdentifier);
    }
  }

  /**
   * Search for and select a person in the admin Activity Center.
   * Uses field data for person lookup. Falls back to testData/preConditions parsing.
   */
  async searchAndSelectPerson(tc: UATTestCase): Promise<void> {
    const personNumber = this.getPersonNumber(tc);
    const personName = this.getPersonName(tc);

    // Prefer person number for search (more precise)
    const searchTerm = personNumber || personName;
    if (searchTerm) {
      await this.benefits.searchPerson(searchTerm);
      // Select by name if available (more readable in UI), else by number
      const selectTerm = personName || searchTerm;
      await this.benefits.selectWorker(selectTerm);
    }
  }

  /**
   * Check if the current page shows a "no benefits relationship" message.
   * This occurs for workers who haven't been set up in the benefits system.
   * Returns true if the message is detected.
   */
  async checkNoBenefitsRelationship(testId: string): Promise<boolean> {
    const noBenefits = this.page.getByText(
      /no benefits|not eligible|no relationship|no enrollment|nothing here|define a benefits relationship|no enrollment opportunities/i
    ).first();
    const detected = await noBenefits.isVisible({ timeout: 5000 }).catch(() => false);
    if (detected) {
      // Previously returned true and the 51 callers all silently `return`'d,
      // turning every "no enrollment opportunity" run into a silent pass. The
      // test scenarios assume an active relationship — if none exists, the
      // test cannot do real work, so fail loudly. The screenshot captures
      // evidence of the no-relationship state.
      await this.benefits.captureBenefitsState(`no-relationship-${testId}`);
      throw new Error(`${testId}: No active benefits relationship / enrollment opportunity — test cannot proceed (person/role setup issue, not a code bug)`);
    }
    return detected;
  }

  /**
   * Capture a screenshot on error and re-throw.
   * Wraps flow execution with error handling to always produce evidence.
   */
  async withErrorHandling(testId: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      console.error(`[Benefits] ${testId}: Error - ${(error as Error).message}`);
      await this.benefits.captureBenefitsState(`error-${testId}`).catch(() => {});
      throw error;
    }
  }

  // =================================================================
  // Field data accessors — prefer migration DB data over regex parsing
  // =================================================================

  /**
   * Get the person identifier (number or name) for searching.
   * Prefers field data from migration DB, falls back to testData parsing.
   */
  protected getPersonIdentifier(tc: UATTestCase): string | null {
    return this.getPersonNumber(tc) || this.getPersonName(tc) || this.extractPersonIdentifier(tc);
  }

  /** Get person number from field data. */
  protected getPersonNumber(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const num = getField(fd, 'Person Number');
      if (num) return num;
    }
    return null;
  }

  /** Get person name from field data. */
  protected getPersonName(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const name = getField(fd, 'Person Name');
      if (name) return name;
    }
    return null;
  }

  /** Get the Program from field data. */
  protected getProgram(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const prog = getField(fd, 'Program');
      if (prog) return prog;
    }
    return null;
  }

  /** Get the Plan from field data. */
  protected getPlan(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const plan = getField(fd, 'Plan');
      if (plan) return plan;
    }
    return null;
  }

  /** Get the Option from field data. */
  protected getOption(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const opt = getField(fd, 'Option');
      if (opt) return opt.trim();
    }
    return null;
  }

  /** Get the Coverage Amount from field data. */
  protected getCoverageAmount(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const amt = getField(fd, 'Coverage Amount');
      if (amt) return amt;
    }
    return null;
  }

  /** Get the Enrollment Date from field data. */
  protected getEnrollmentDate(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const dt = getField(fd, 'Enrollment Date');
      if (dt) return dt;
    }
    return null;
  }

  /** Get Assignment Category from field data. */
  protected getAssignmentCategory(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const cat = getField(fd, 'Assignment Category');
      if (cat) return cat;
    }
    return null;
  }

  /** Get Person Type from field data. */
  protected getPersonType(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd) {
      const pt = getField(fd, 'Person Type');
      if (pt) return pt;
    }
    return null;
  }

  /** Get the scenario from field data. */
  protected getScenario(tc: UATTestCase): string | null {
    const fd = getFieldData(tc.testId);
    if (fd && fd.scenario) return fd.scenario;
    return null;
  }

  /**
   * Classify the business process into a routing category.
   * Returns one of: 'new-hire', 'rehire', 'job-reclass', 'termination',
   * 'life-event', 'dependent', 'beneficiary', 'leave', 'international',
   * 'military', 'retirement', 'disability', '403b', 'view', 'enrollment',
   * 'flex', 'reprocess', 'general'.
   */
  protected classifyBusinessProcess(tc: UATTestCase): string {
    const bp = (tc.businessProcess || '').toLowerCase();
    const sc = (tc.testScenario || '').toLowerCase();
    const combined = `${bp} ${sc}`;

    // Order matters: more specific patterns must come before general ones.
    // E.g. "403b retirement plan" should match '403b' not 'retirement'.
    // E.g. "Puerto Rico ... retirement plans" should match 'regional' not 'retirement'.
    if (bp.includes('new hire enrollment') || bp.includes('new hire')) return 'new-hire';
    if (bp.includes('rehire') || bp.includes('new rehire')) return 'rehire';
    if (bp.includes('job reclass') || bp.includes('reclass from')) return 'job-reclass';
    if (bp.includes('terminat') || bp.includes('terminate')) return 'termination';
    if (bp.includes('life event') || sc.includes('life event') || bp.includes('divorce') || bp.includes('marriage') || bp.includes('married') || bp.includes('birth') || bp.includes('adoption')) return 'life-event';
    if (bp.includes('dependent')) return 'dependent';
    if (bp.includes('beneficiar')) return 'beneficiary';
    if (bp.includes('unpaid leave') || bp.includes('leave of absence') || bp.includes('return from leave')) return 'leave';
    if (bp.includes('international assignment') || bp.includes('moved from international') || bp.includes('moved to international')) return 'international';
    if (bp.includes('military leave')) return 'military';
    if (bp.includes('disability') || bp.includes('ltd terminat') || bp.includes('on disability')) return 'disability';
    // 403b, flex, regional BEFORE retirement (they may contain "retirement" in text)
    if (bp.includes('403b') || bp.includes('403(b)') || bp.includes('catch up limit') || bp.includes('age catch up')) return '403b';
    if (bp.includes('flex benefit') || bp.includes('flex credit') || bp.includes('flex election')) return 'flex';
    if (bp.includes('hawaii')) return 'regional';
    if (bp.includes('puerto rico')) return 'regional';
    // Now retirement (only matches when no more-specific pattern matched)
    if (bp.includes('retires') || (bp.includes('retire') && !bp.includes('retirement plan'))) return 'retirement';
    if (bp.includes('view benefits') || bp.includes('can view') || combined.includes('view')) return 'view';
    if (bp.includes('confirmation statement')) return 'confirmation';
    if (bp.includes('reprocess')) return 'reprocess';
    if (bp.includes('continuation of coverage') || bp.includes('cobra')) return 'continuation';
    if (bp.includes('self supported') || bp.includes('subsidiary')) return 'non-standard-enrollment';
    if (bp.includes('waive healthcare') || bp.includes('waives healthcare')) return 'waive';
    if (bp.includes('voluntary life') || bp.includes('voluntery life') || bp.includes('vtl')) return 'voluntary-life';
    if (bp.includes('adjust') || bp.includes('basic life')) return 'plan-adjustment';
    if (bp.includes('benadm fee') || bp.includes('adding benadm')) return 'admin-fee';
    if (bp.includes('spouse') && (bp.includes('set up') || bp.includes('healthcare'))) return 'spouse-setup';
    if (bp.includes('ministry location') || bp.includes('reassignment')) return 'location-change';
    if (bp.includes('hourly') && (bp.includes('anniversary') || bp.includes('work anniversary'))) return 'anniversary';
    if (bp.includes('death')) return 'death';
    if (bp.includes('ages out') || bp.includes('turns 26') || bp.includes('dep child')) return 'dependent-aging';
    if (bp.includes('enrollment') || bp.includes('enroll')) return 'enrollment';
    if (bp.includes('elect') || bp.includes('election')) return 'election';
    if (bp.includes('correct') || bp.includes('date changes')) return 'correction';
    if (bp.includes('added incorrectly')) return 'correction';
    if (bp.includes('benefit service date')) return 'service-date';

    return 'general';
  }

  /**
   * Log field data summary for a test case.
   * Prints the key field data values for debugging.
   */
  protected logFieldData(tc: UATTestCase): void {
    const person = this.getPersonName(tc);
    const personNum = this.getPersonNumber(tc);
    const plan = this.getPlan(tc);
    const program = this.getProgram(tc);
    const option = this.getOption(tc);
    const amount = this.getCoverageAmount(tc);
    const category = this.classifyBusinessProcess(tc);
    console.log(`[Benefits] ${tc.testId}: category=${category} person=${person || 'N/A'} (${personNum || 'N/A'}) plan=${plan || 'N/A'} program=${program || 'N/A'} option=${option || 'N/A'} coverage=${amount || 'N/A'}`);
  }

  // =================================================================
  // Legacy extractors — kept for backward compatibility and fallback
  // =================================================================

  /**
   * Extract a person name or number from the test case text fields.
   * Used as fallback when field data is unavailable.
   */
  protected extractPersonIdentifier(tc: UATTestCase): string | null {
    const numberMatch = tc.testData.match(/(?:person\s*(?:number|#|no))\s*[:\-]?\s*(\S+)/i)
      || tc.preConditions.match(/(?:person\s*(?:number|#|no))\s*[:\-]?\s*(\S+)/i);
    if (numberMatch) return numberMatch[1];

    const nameMatch = tc.testData.match(/(?:employee|person|name)\s*[:\-]?\s*([A-Za-z]+\s+[A-Za-z]+)/i)
      || tc.preConditions.match(/(?:employee|person|name)\s*[:\-]?\s*([A-Za-z]+\s+[A-Za-z]+)/i);
    if (nameMatch) return nameMatch[1];

    return null;
  }

  /**
   * Extract a date from the test case data fields.
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
      'Dependent Aging Out', 'Spouse on Staff',
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
   */
  protected extractPlanTypes(tc: UATTestCase): string[] {
    const data = `${tc.testData} ${tc.testScenario} ${tc.businessProcess}`.toLowerCase();
    const planTypes = ['medical', 'dental', 'vision', 'life', 'ltd', '403b', '401k',
      'healthcare', 'disability', 'fsa', 'hra', 'retirement', 'voluntary'];
    return planTypes.filter(plan => data.includes(plan));
  }

  /**
   * Extract coverage level from the test case data.
   */
  protected extractCoverageLevel(tc: UATTestCase): string | null {
    const data = `${tc.testData} ${tc.testScenario} ${tc.businessProcess}`.toLowerCase();
    const coverageLevels = [
      'employee only', 'employee + spouse', 'employee + family',
      'employee + child', 'employee + children',
      'staff only', 'staff+1', 'staff+2', 'staff+4',
    ];
    for (const level of coverageLevels) {
      if (data.includes(level)) {
        return level;
      }
    }
    return null;
  }
}
