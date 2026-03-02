import { type Page } from '@playwright/test';
import { CreateWorkRelationshipFlow } from './create-work-relationship.flow';
import type { TestCase } from '../../data/types';

/**
 * Flow: Rehire an Employee
 * Tab: "Core - rehires"
 *
 * Delegates to CreateWorkRelationshipFlow since rehires use the exact same
 * wizard: search person → Actions → "Create Work Relationship" → fill wizard.
 * The CWR flow handles "Use Person > " prefixed field data and has robust
 * retry logic for the Actions menu interaction.
 */
export class RehireEmployeeFlow extends CreateWorkRelationshipFlow {
  constructor(page: Page) {
    super(page);
  }

  // Inherits execute(tc) from CreateWorkRelationshipFlow which handles:
  // 1. Login + navigate to Person Management
  // 2. Search for person (supports "Use Person > Last Name" etc.)
  // 3. Actions → Create Work Relationship (with retries)
  // 4. Fill When/Why (handles "Use Person > When" prefix)
  // 5. Skip Person Information (pre-filled for existing person)
  // 6. Fill Employment Information (Assignment, Managers, Payroll, Salary)
  // 7. Skip Compensation
  // 8. Submit
}
