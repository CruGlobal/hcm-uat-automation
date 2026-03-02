#!/usr/bin/env npx tsx
/**
 * Discover and populate Person Extra Info records in Oracle HCM
 *
 * This script:
 * 1. Finds the Person Extra Info REST API endpoint
 * 2. Identifies people with support_type != NONE
 * 3. Creates missing Person Extra Info records with designation='new', staff_account='new', primary=Y
 */

import { hcmGet, hcmPost } from './lib/hcm-rest-api';

const BASE_URL = 'https://stafflife-icahjb-test.fa.ocs.oraclecloud.com';

// Common endpoint patterns to try
const ENDPOINT_PATTERNS = [
  '/hcmRestApi/resources/latest/personExtraNumbers',
  '/hcmRestApi/resources/latest/personExtraInformation',
  '/hcmRestApi/resources/latest/personInformation',
  '/hcmRestApi/resources/v1/personExtraNumbers',
];

/**
 * Discover the correct endpoint for Person Extra Info
 */
async function discoverEndpoint(): Promise<string | null> {
  console.log('🔍 Discovering Person Extra Info endpoint...\n');

  for (const pattern of ENDPOINT_PATTERNS) {
    try {
      console.log(`  Trying: ${pattern}`);
      const result = await hcmGet(null, BASE_URL, `${pattern}?limit=1&onlyData=true`);
      console.log(`  ✓ Found! Endpoint: ${pattern}`);
      return pattern;
    } catch (e: unknown) {
      const err = e as any;
      if (err.statusCode === 404) {
        console.log(`  ✗ Not found (404)`);
      } else {
        console.log(`  ✗ Error: ${err.statusCode || err.message}`);
      }
    }
  }

  console.log('\n❌ Could not discover Person Extra Info endpoint');
  return null;
}

/**
 * Get all assignments with support_type != NONE and find unique people
 */
async function findPeopleWithSupportType(): Promise<any[]> {
  console.log('\n📊 Querying assignments with support_type != NONE...');

  try {
    // Query assignments - filter for non-NONE support types
    const endpoint = `/hcmRestApi/resources/latest/assignments?q=PeopleGroupValue NOT IN ('NONE','')&limit=1000&onlyData=true`;
    const result = await hcmGet(null, BASE_URL, endpoint);
    const assignments = result?.items || [];

    console.log(`Found ${assignments.length} assignments with support_type != NONE`);

    // Get unique person IDs and their details
    const personMap = new Map<number, any>();
    for (const asg of assignments) {
      if (!personMap.has(asg.PersonId)) {
        personMap.set(asg.PersonId, {
          PersonId: asg.PersonId,
          PersonNumber: asg.PersonNumber,
          DisplayName: asg.DisplayName,
          SupportType: asg.PeopleGroupValue,
        });
      }
    }

    const people = Array.from(personMap.values());
    console.log(`Found ${people.length} unique people with support_type != NONE`);
    return people;
  } catch (e: unknown) {
    const err = e as any;
    console.error(`Error querying assignments: ${err.message}`);
    return [];
  }
}

/**
 * Create Person Extra Info records
 */
async function createPersonExtraInfo(endpoint: string, personId: number, personNumber: string): Promise<boolean> {
  try {
    console.log(`  Creating record for ${personNumber}...`);

    const payload = {
      PersonId: personId,
      InformationType: 'Staff Account and Designation',
      DesignationNumber: 'new',
      StaffAccountNumber: 'new',
      PrimaryPerson: 'Y',
    };

    const result = await hcmPost(BASE_URL, endpoint, payload);
    console.log(`  ✓ Created`);
    return true;
  } catch (e: unknown) {
    const err = e as any;
    if (err.statusCode === 409 || err.message?.includes('unique')) {
      console.log(`  ⊘ Already exists (skipped)`);
      return true;
    }
    console.error(`  ✗ Error: ${err.statusCode || err.message}`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Step 1: Discover endpoint
    const endpoint = await discoverEndpoint();
    if (!endpoint) {
      console.error('\nCannot proceed without endpoint. Try browsing Oracle HCM to capture the request.');
      process.exit(1);
    }

    // Step 2: Find people with support_type != NONE
    const people = await findPeopleWithSupportType();
    if (people.length === 0) {
      console.log('\n✓ No people found with support_type != NONE');
      process.exit(0);
    }

    // Step 3: Create missing records
    console.log(`\n📝 Creating Person Extra Info records...\n`);
    let created = 0;
    let failed = 0;

    for (const person of people) {
      const success = await createPersonExtraInfo(endpoint, person.PersonId, person.PersonNumber);
      if (success) created++;
      else failed++;
    }

    console.log(`\n✓ Done: ${created} created, ${failed} failed`);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main();
