/**
 * Shared REST API helpers for Oracle HCM.
 *
 * Uses Basic Auth with bot user credentials for REST API access.
 * Oracle HCM REST API does NOT accept SSO session cookies — it requires
 * either Basic Auth or OAuth. We use Basic Auth with a bot user that has
 * Oracle native credentials (direct login, no SSO/Okta).
 *
 * Available via REST (200 OK with HR Specialist role):
 *   - workers (lookup PersonId by PersonNumber)
 *   - rolesLOV (search/lookup roles by code or name)
 *
 * NOT available via REST (403 — needs IT Security Manager role):
 *   - userAccounts (create, read, update, delete)
 *   - SCIM endpoints
 *
 * For user account operations, use Security Console UI automation instead
 * (see provision-bot-accounts.ts which uses the same approach as assign-roles.ts).
 */
import type { Page } from 'playwright';

// ── Types ────────────────────────────────────────────────────────────

export interface WorkerRecord {
  PersonId: number;
  PersonNumber: string;
  DisplayName: string;
  [key: string]: unknown;
}

export interface RoleLOVRecord {
  RoleId: number;
  RoleCode: string;
  RoleName: string;
  [key: string]: unknown;
}

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

// ── Default Credentials ──────────────────────────────────────────────

/** Default bot credentials for REST API access. */
const DEFAULT_REST_CREDS: BasicAuthCredentials = {
  username: 'uat.bot_hr_admin',
  password: 'WinBuildSend!1951@cru',
};

// ── Core REST Helper ─────────────────────────────────────────────────

/**
 * GET request using Basic Auth via Playwright's request API.
 * Does NOT require the page to be logged in — uses its own credentials.
 */
export async function hcmGet(
  page: Page,
  baseUrl: string,
  endpoint: string,
  creds: BasicAuthCredentials = DEFAULT_REST_CREDS,
): Promise<any> {
  const url = `${baseUrl}${endpoint}`;
  const basicAuth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');

  const response = await page.request.get(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Basic ${basicAuth}`,
    },
  });

  if (!response.ok()) {
    const text = await response.text().catch(() => '');
    throw new Error(`GET ${endpoint} → ${response.status()} ${response.statusText()}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

// ── Domain-Specific Operations ───────────────────────────────────────

/**
 * Look up a worker's PersonId by PersonNumber.
 * Returns the full worker record or null if not found.
 */
export async function lookupPersonId(
  page: Page,
  baseUrl: string,
  personNumber: string,
  creds?: BasicAuthCredentials,
): Promise<WorkerRecord | null> {
  const endpoint = `/hcmRestApi/resources/latest/workers?q=PersonNumber='${personNumber}'&fields=PersonId,PersonNumber,DisplayName&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  const items = data?.items;
  if (!items || items.length === 0) return null;
  return items[0] as WorkerRecord;
}

/**
 * Look up a role by RoleCode from the roles LOV.
 * Returns the role record or null if not found.
 */
export async function lookupRole(
  page: Page,
  baseUrl: string,
  roleCode: string,
  creds?: BasicAuthCredentials,
): Promise<RoleLOVRecord | null> {
  const endpoint = `/hcmRestApi/resources/latest/rolesLOV?q=RoleCode='${roleCode}'&onlyData=true`;
  const data = await hcmGet(page, baseUrl, endpoint, creds);
  const items = data?.items;
  if (!items || items.length === 0) return null;
  return items[0] as RoleLOVRecord;
}

/**
 * Search for roles matching a partial name or code.
 * Returns an array of matching role records.
 */
export async function searchRoles(
  page: Page,
  baseUrl: string,
  searchTerm: string,
  limit = 25,
  creds?: BasicAuthCredentials,
): Promise<RoleLOVRecord[]> {
  // Try RoleName LIKE search first
  const encoded = encodeURIComponent(searchTerm);
  const endpoint = `/hcmRestApi/resources/latest/rolesLOV?q=RoleName LIKE '*${encoded}*'&limit=${limit}&onlyData=true`;
  try {
    const data = await hcmGet(page, baseUrl, endpoint, creds);
    return (data?.items || []) as RoleLOVRecord[];
  } catch {
    // Fallback: try RoleCode LIKE search
    const endpoint2 = `/hcmRestApi/resources/latest/rolesLOV?q=RoleCode LIKE '*${encoded}*'&limit=${limit}&onlyData=true`;
    try {
      const data2 = await hcmGet(page, baseUrl, endpoint2, creds);
      return (data2?.items || []) as RoleLOVRecord[];
    } catch {
      return [];
    }
  }
}
