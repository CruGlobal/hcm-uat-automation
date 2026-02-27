import { env } from '../config/environment';
import type { TestCase } from './types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Refresh the OAuth access token using the stored refresh token. */
async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      refresh_token: env.google.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Fetch a single tab's raw grid data from Google Sheets API v4.
 * Returns a 2D array of strings (rows x columns).
 */
async function fetchTabRaw(tabName: string, accessToken: string): Promise<string[][]> {
  const range = encodeURIComponent(`'${tabName}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.google.sheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch tab "${tabName}": ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  return (body.values || []).map((row: any[]) =>
    row.map((cell) => (cell == null ? '' : String(cell)))
  );
}

/**
 * Transpose a tab's raw grid into TestCase objects.
 *
 * Sheet layout (transposed):
 *   - Column A: field labels (section headers + field names)
 *   - Column B: instructions/descriptions
 *   - Columns C+: one test case per column
 *   - The row where col A contains "TestCase" has the test IDs in cols C+
 *
 * We build composite field keys like "Section > Field" to preserve context.
 */
function transposeToTestCases(tabName: string, rows: string[][]): TestCase[] {
  if (rows.length < 2) return [];

  // Find the TestCase row (has test IDs)
  let testCaseRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const cellA = (rows[i][0] || '').trim().toLowerCase();
    if (cellA === 'testcase' || cellA === 'test case') {
      testCaseRowIdx = i;
      break;
    }
  }

  // Fallback: use row 0 if it looks like it has test IDs (check col 2+)
  if (testCaseRowIdx === -1) {
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      const sample = (rows[i][2] || '').trim();
      if (sample.match(/^[A-Z]{2,}-\d/)) {
        testCaseRowIdx = i;
        break;
      }
    }
  }

  if (testCaseRowIdx === -1) {
    // Last resort: row 1 often has test IDs
    testCaseRowIdx = 1;
  }

  const testIdRow = rows[testCaseRowIdx] || [];
  const maxCols = Math.max(...rows.map((r) => r.length));
  const startCol = 2; // Columns C+ (A=labels, B=descriptions)

  // Collect test case columns
  const testColumns: { colIdx: number; testId: string }[] = [];
  for (let c = startCol; c < maxCols; c++) {
    const id = (testIdRow[c] || '').trim();
    if (id && id.match(/^[A-Z]{2,}-\d/)) {
      testColumns.push({ colIdx: c, testId: id });
    }
  }

  if (testColumns.length === 0) return [];

  // Walk rows to build field keys with section context
  let currentSection = '';
  const fieldRows: { key: string; rowIdx: number }[] = [];

  for (let r = 0; r < rows.length; r++) {
    if (r === testCaseRowIdx) continue;

    const colA = (rows[r][0] || '').trim();
    const colB = (rows[r][1] || '').trim();

    if (!colA && !colB) continue;

    // Detect section headers: col A has text and data columns are mostly empty
    const dataValues = rows[r].slice(startCol).filter((c) => (c || '').trim());
    const isSection = colA && dataValues.length === 0 && !colA.startsWith('*');

    if (isSection) {
      currentSection = colA.replace(/:$/, '');
      continue;
    }

    // Build field key from colA + colB
    const fieldName = colB || colA;
    if (!fieldName) continue;

    const key = currentSection ? `${currentSection} > ${fieldName}` : fieldName;
    fieldRows.push({ key, rowIdx: r });
  }

  // Scenario row: typically the row right after the TestCase row, or row 2
  const scenarioRowIdx = testCaseRowIdx + 1;

  return testColumns.map(({ colIdx, testId }) => {
    const fields: Record<string, string> = {};
    for (const { key, rowIdx } of fieldRows) {
      const val = (rows[rowIdx]?.[colIdx] || '').trim();
      if (val) {
        fields[key] = val;
      }
    }

    const scenario = (rows[scenarioRowIdx]?.[colIdx] || '').trim();

    return {
      testId,
      tab: tabName,
      scenario,
      fields,
      columnIndex: colIdx,
    };
  });
}

/** Fetch a tab from Google Sheets and parse into TestCase[]. */
export async function fetchTabAsTestCases(tabName: string): Promise<TestCase[]> {
  const accessToken = await getAccessToken();
  const rows = await fetchTabRaw(tabName, accessToken);
  return transposeToTestCases(tabName, rows);
}

/** Fetch all tabs at once (shares a single access token). */
export async function fetchAllTabs(tabNames: readonly string[]): Promise<Map<string, TestCase[]>> {
  const accessToken = await getAccessToken();
  const result = new Map<string, TestCase[]>();

  for (const tab of tabNames) {
    try {
      const rows = await fetchTabRaw(tab, accessToken);
      result.set(tab, transposeToTestCases(tab, rows));
    } catch (err) {
      console.error(`  ✗ ${tab}: ${(err as Error).message}`);
      result.set(tab, []);
    }
  }

  return result;
}
