/**
 * Parse test script xlsx/xlsm files and extract step-by-step test procedures.
 *
 * Reads each file in xls_files/, iterates over every sheet that looks like a
 * test script (HCM.CORE.*, HCM.ABS.*, HCM.OTL.*, HCM.COMP.*), extracts
 * header metadata and the step table, then writes one JSON file per source
 * workbook into .cache/test-scripts/.
 *
 * Usage:  npx tsx scripts/parse-xlsx-scripts.ts
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestStep {
  step: number;
  area: string;
  module: string;
  action: string;
  input: string;
  expectedResult: string;
}

interface TestScript {
  scriptId: string;           // e.g. "HCM.CORE.300"
  sheetName: string;          // raw sheet name
  title: string;              // full title from row 1 (e.g. "HCM.CORE.300 - View Directory Personal Info")
  moduleCategory: string;     // e.g. "Core HR Test Scripts"
  client: string;             // e.g. "CRU" or "[Client]"
  startPage: string;          // e.g. "Home"
  role: string;               // e.g. "HR Specialist"
  description: string;        // description line
  steps: TestStep[];
}

interface ParsedFile {
  sourceFile: string;
  totalSheets: number;
  parsedScripts: number;
  totalSteps: number;
  scripts: TestScript[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCRIPT_SHEET_PATTERN = /^[\s]*(HCM\.\w+\.\d+(?:\.\d+)?)/;

function isScriptSheet(sheetName: string): boolean {
  return SCRIPT_SHEET_PATTERN.test(sheetName.trim());
}

function extractScriptId(sheetName: string): string {
  const m = sheetName.trim().match(SCRIPT_SHEET_PATTERN);
  return m ? m[1] : sheetName.trim();
}

/**
 * Find the header row index by looking for a row whose first non-empty cells
 * contain "Step", "Area", "Module", "Action" (case-insensitive).
 */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    const vals = row.map(c => String(c ?? '').trim().toLowerCase());
    if (vals.includes('step') && vals.includes('action')) {
      return i;
    }
  }
  return -1;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// ---------------------------------------------------------------------------
// Parse one sheet
// ---------------------------------------------------------------------------

function parseSheet(ws: XLSX.WorkSheet, sheetName: string): TestScript | null {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 10) return null;

  // Extract metadata from header region (rows 0-12 typically)
  const moduleCategory = str(rows[0]?.[0]);
  const title = str(rows[1]?.[0]);
  const client = str(rows[4]?.[0]);
  const startPage = str(rows[6]?.[0]);
  const role = str(rows[7]?.[0]);

  // Description can be in row 8
  let description = '';
  for (let i = 7; i < Math.min(rows.length, 12); i++) {
    const val = str(rows[i]?.[0]);
    if (val.toLowerCase().startsWith('description:')) {
      description = val.replace(/^description:\s*/i, '');
      break;
    }
  }

  const scriptId = extractScriptId(sheetName);

  // Find the header row
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return null;

  // Build column index map from header row
  const headerRow = rows[headerIdx].map(c => str(c).toLowerCase());
  const colIdx = {
    step: headerRow.indexOf('step'),
    area: headerRow.indexOf('area'),
    module: headerRow.indexOf('module'),
    action: headerRow.indexOf('action'),
    input: headerRow.indexOf('input'),
    expectedResult: headerRow.findIndex(h => h.includes('expected')),
  };

  // Parse step rows
  const steps: TestStep[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const stepVal = row[colIdx.step];
    const stepNum = typeof stepVal === 'number' ? stepVal : parseInt(str(stepVal), 10);
    if (isNaN(stepNum) || stepNum <= 0) continue;

    const action = str(row[colIdx.action]);
    const expectedResult = colIdx.expectedResult >= 0 ? str(row[colIdx.expectedResult]) : '';

    // Skip rows where step number exists but action AND expected result are both empty
    // (template-only rows with just step numbers)
    // We still keep them if at least one has content
    if (!action && !expectedResult) continue;

    steps.push({
      step: stepNum,
      area: str(row[colIdx.area]),
      module: str(row[colIdx.module]),
      action,
      input: str(row[colIdx.input]),
      expectedResult,
    });
  }

  return {
    scriptId,
    sheetName: sheetName.trim(),
    title: title || scriptId,
    moduleCategory,
    client,
    startPage,
    role,
    description,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Parse one file
// ---------------------------------------------------------------------------

function parseFile(filePath: string): ParsedFile {
  const fileName = path.basename(filePath);
  console.log(`\nParsing: ${fileName}`);

  const wb = XLSX.readFile(filePath);
  const scripts: TestScript[] = [];

  for (const sheetName of wb.SheetNames) {
    if (!isScriptSheet(sheetName)) {
      continue;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const script = parseSheet(ws, sheetName);
    if (script) {
      scripts.push(script);
    }
  }

  const totalSteps = scripts.reduce((sum, s) => sum + s.steps.length, 0);

  console.log(`  Sheets: ${wb.SheetNames.length} total, ${scripts.length} test scripts parsed`);
  console.log(`  Total steps extracted: ${totalSteps}`);

  // Show per-script step counts
  const withSteps = scripts.filter(s => s.steps.length > 0);
  const withoutSteps = scripts.filter(s => s.steps.length === 0);
  console.log(`  Scripts with steps: ${withSteps.length}, without steps (template-only): ${withoutSteps.length}`);

  if (withSteps.length > 0) {
    const stepCounts = withSteps.map(s => s.steps.length);
    const min = Math.min(...stepCounts);
    const max = Math.max(...stepCounts);
    const avg = (stepCounts.reduce((a, b) => a + b, 0) / stepCounts.length).toFixed(1);
    console.log(`  Steps per script: min=${min}, max=${max}, avg=${avg}`);
  }

  return {
    sourceFile: fileName,
    totalSheets: wb.SheetNames.length,
    parsedScripts: scripts.length,
    totalSteps,
    scripts,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const xlsDir = path.join(projectRoot, 'xls_files');
  const outputDir = path.join(projectRoot, '.cache', 'test-scripts');

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const files = [
    '_Cru Core HR - Test Scripts.xlsx',
    'Cru Absence - Test Scripts.xlsm',
    'Cru Time and Labor (OTL) - Test Scripts.xlsm',
    'Cru Workforce Compensation - Test Scripts - WIP.xlsm',
  ];

  console.log('=== Parsing XLSX/XLSM Test Script Files ===');
  console.log(`Source directory: ${xlsDir}`);
  console.log(`Output directory: ${outputDir}`);

  const summaryRows: { file: string; scripts: number; withSteps: number; totalSteps: number }[] = [];

  for (const file of files) {
    const filePath = path.join(xlsDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`\nSkipping (not found): ${file}`);
      continue;
    }

    const parsed = parseFile(filePath);

    // Save to JSON
    const outName = file
      .replace(/\.(xlsx|xlsm)$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      + '.json';
    const outPath = path.join(outputDir, outName);
    fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
    console.log(`  Saved: ${outPath}`);

    summaryRows.push({
      file,
      scripts: parsed.parsedScripts,
      withSteps: parsed.scripts.filter(s => s.steps.length > 0).length,
      totalSteps: parsed.totalSteps,
    });
  }

  // Print summary table
  console.log('\n=== Summary ===');
  console.log('File'.padEnd(60) + 'Scripts'.padEnd(10) + 'With Steps'.padEnd(12) + 'Total Steps');
  console.log('-'.repeat(92));
  let grandScripts = 0, grandWithSteps = 0, grandSteps = 0;
  for (const row of summaryRows) {
    console.log(
      row.file.padEnd(60) +
      String(row.scripts).padEnd(10) +
      String(row.withSteps).padEnd(12) +
      String(row.totalSteps)
    );
    grandScripts += row.scripts;
    grandWithSteps += row.withSteps;
    grandSteps += row.totalSteps;
  }
  console.log('-'.repeat(92));
  console.log(
    'TOTAL'.padEnd(60) +
    String(grandScripts).padEnd(10) +
    String(grandWithSteps).padEnd(12) +
    String(grandSteps)
  );
}

main();
