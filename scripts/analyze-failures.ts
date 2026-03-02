/**
 * Analyze test failures from merged Playwright JSON report.
 *
 * Reads test-results/results.json (or per-bot results-*.json files),
 * cross-references with .cache/uat-plan.json, categorizes failures,
 * and outputs analysis files + console summary.
 *
 * Usage:
 *   npx tsx scripts/analyze-failures.ts                    # Use merged results.json
 *   npx tsx scripts/analyze-failures.ts --report path.json # Use specific report file
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadUATPlan } from '../src/data/uat-plan-provider';
import type { UATTestCase } from '../src/data/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type FailureCategory =
  | 'flow-routing'
  | 'missing-field-data'
  | 'selector-not-found'
  | 'navigation-error'
  | 'permission-denied'
  | 'data-not-found'
  | 'validation-failure'
  | 'oracle-timeout'
  | 'other';

interface FailureEntry {
  testId: string;
  title: string;
  error: string;
  category: FailureCategory;
  module: string;
  businessProcess: string;
  transactionCategory: string;
  testerName: string;
  expectedResult: string;
}

interface CategoryBucket {
  count: number;
  testIds: { testId: string; error: string }[];
}

interface ModuleAnalysis {
  [category: string]: CategoryBucket;
}

interface FailureAnalysis {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: string;
    analyzedAt: string;
  };
  modules: { [module: string]: ModuleAnalysis };
}

// ─── Playwright JSON report types ────────────────────────────────────────────

interface PWResult {
  status: string;
  errors: { message?: string }[];
}

interface PWTest {
  expectedStatus: string;
  results: PWResult[];
}

interface PWSpec {
  title: string;
  tests: PWTest[];
}

interface PWSuite {
  title: string;
  specs: PWSpec[];
  suites?: PWSuite[];
}

interface PWReport {
  suites: PWSuite[];
}

// ─── Failure categorization ──────────────────────────────────────────────────

const CATEGORY_PATTERNS: [FailureCategory, RegExp][] = [
  ['flow-routing', /unknown business process|unhandled.*route|no flow.*for|unsupported.*transaction/i],
  ['missing-field-data', /required field|field.*empty|missing.*field|fillField.*undefined|cannot read.*field/i],
  ['permission-denied', /access denied|insufficient privilege|not authorized|permission denied|you do not have.*access|security.*violation/i],
  ['data-not-found', /person.*not found|search returned 0|no results|no matching|record not found|no person/i],
  ['selector-not-found', /timeout.*waiting.*selector|waiting for locator|locator.*resolved to.*element|strict mode violation|timed out.*click|timed out.*fill|waiting for.*visible|ADF button.*not found|tile.*not found|not found by text/i],
  ['navigation-error', /failed to navigate|page.*load|net::ERR|navigation.*timeout|navigating to|page\.goto|waitForURL|page\.waitFor/i],
  ['oracle-timeout', /oracle.*timeout|server.*timeout|504 gateway|502 bad gateway|page crash|target.*closed|context.*closed|browser.*disconnected/i],
  ['validation-failure', /expect\(received\)|toBe|toEqual|toContain|toBeTruthy|toHaveText|assertion.*failed|expected.*but.*received/i],
];

function categorizeError(errorMsg: string): FailureCategory {
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(errorMsg)) return category;
  }
  return 'other';
}

// ─── Extract test ID from spec title ─────────────────────────────────────────

function extractTestId(title: string): string | null {
  // Match patterns like "HR-019:", "PY-001-01:", "AB-012.00:", "TL-074:"
  const match = title.match(/^([A-Z]{2,4}-\d+(?:[.-]\d+)*)/);
  return match ? match[1] : null;
}

// ─── Collect all specs from nested suites ────────────────────────────────────

interface FlatSpec {
  title: string;
  tests: PWTest[];
}

function collectSpecs(suite: PWSuite): FlatSpec[] {
  const specs: FlatSpec[] = [...suite.specs];
  if (suite.suites) {
    for (const sub of suite.suites) {
      specs.push(...collectSpecs(sub));
    }
  }
  return specs;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const resultsDir = path.resolve('test-results');

  // Determine report source
  let report: PWReport;
  const reportArgIdx = args.indexOf('--report');
  if (reportArgIdx !== -1 && args[reportArgIdx + 1]) {
    const reportPath = path.resolve(args[reportArgIdx + 1]);
    report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  } else {
    // Try merged results.json first, then merge per-bot files
    const mergedPath = path.join(resultsDir, 'results.json');
    if (fs.existsSync(mergedPath)) {
      report = JSON.parse(fs.readFileSync(mergedPath, 'utf-8'));
    } else {
      // Merge per-bot files on the fly
      const botFiles = fs.readdirSync(resultsDir)
        .filter(f => f.match(/^results-.*\.json$/))
        .map(f => path.join(resultsDir, f));
      if (botFiles.length === 0) {
        console.error('No results found. Run tests first, then re-run this script.');
        process.exit(1);
      }
      const suites: PWSuite[] = [];
      for (const file of botFiles) {
        try {
          const r = JSON.parse(fs.readFileSync(file, 'utf-8'));
          if (r.suites) suites.push(...r.suites);
        } catch { /* skip malformed */ }
      }
      report = { suites };
      console.log(`Merged ${botFiles.length} per-bot report files.\n`);
    }
  }

  // Build UAT Plan lookup by testId
  const uatPlan = loadUATPlan();
  const uatByTestId = new Map<string, UATTestCase>();
  for (const tc of uatPlan) {
    uatByTestId.set(tc.testId, tc);
  }

  // Walk all specs and collect results
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: FailureEntry[] = [];

  for (const topSuite of report.suites) {
    const allSpecs = collectSpecs(topSuite);
    for (const spec of allSpecs) {
      for (const test of spec.tests) {
        totalTests++;
        // Determine final status
        const lastResult = test.results[test.results.length - 1];
        const status = lastResult?.status || 'skipped';

        if (status === 'passed') {
          passed++;
        } else if (status === 'skipped') {
          skipped++;
        } else {
          // failed, timedOut, interrupted — all count as failures
          failed++;
          const testId = extractTestId(spec.title);
          const errorMessages = (lastResult?.errors || [])
            .map(e => e.message || '')
            .filter(Boolean);
          const errorMsg = errorMessages.join('\n').substring(0, 500) || `Status: ${status}`;
          // Strip ANSI escape codes for cleaner output
          const cleanError = errorMsg.replace(/\u001b\[\d+m/g, '');
          const category = categorizeError(cleanError);

          const uatCase = testId ? uatByTestId.get(testId) : undefined;
          failures.push({
            testId: testId || spec.title.substring(0, 30),
            title: spec.title,
            error: cleanError,
            category,
            module: uatCase?.module || uatCase?.tabName || 'Unknown',
            businessProcess: uatCase?.businessProcess || '',
            transactionCategory: uatCase?.transactionCategory || '',
            testerName: uatCase?.testerName || '',
            expectedResult: uatCase?.expectedResult || '',
          });
        }
      }
    }
  }

  // Group failures by module → category
  const moduleAnalysis: { [module: string]: ModuleAnalysis } = {};
  for (const f of failures) {
    if (!moduleAnalysis[f.module]) moduleAnalysis[f.module] = {};
    const mod = moduleAnalysis[f.module];
    if (!mod[f.category]) mod[f.category] = { count: 0, testIds: [] };
    mod[f.category].count++;
    mod[f.category].testIds.push({ testId: f.testId, error: f.error });
  }

  const analysis: FailureAnalysis = {
    summary: {
      totalTests,
      passed,
      failed,
      skipped,
      passRate: totalTests - skipped > 0
        ? `${Math.round((100 * passed) / (passed + failed))}%`
        : '—',
      analyzedAt: new Date().toISOString(),
    },
    modules: moduleAnalysis,
  };

  // ─── Write outputs ──────────────────────────────────────────────────────────

  fs.mkdirSync(resultsDir, { recursive: true });

  // 1. Main analysis file
  const analysisPath = path.join(resultsDir, 'failure-analysis.json');
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  console.log(`Written: ${analysisPath}`);

  // 2. Per-module task files
  const moduleTasksDir = path.join(resultsDir, 'module-tasks');
  fs.mkdirSync(moduleTasksDir, { recursive: true });
  for (const [module, categories] of Object.entries(moduleAnalysis)) {
    const filename = module.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.json';
    const moduleFailures = failures.filter(f => f.module === module);
    const moduleFile = {
      module,
      totalFailures: moduleFailures.length,
      categories,
      failures: moduleFailures.map(f => ({
        testId: f.testId,
        category: f.category,
        businessProcess: f.businessProcess,
        transactionCategory: f.transactionCategory,
        testerName: f.testerName,
        error: f.error.substring(0, 300),
      })),
    };
    fs.writeFileSync(path.join(moduleTasksDir, filename), JSON.stringify(moduleFile, null, 2));
  }
  console.log(`Written: ${moduleTasksDir}/ (${Object.keys(moduleAnalysis).length} module files)`);

  // ─── Console summary ───────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`  FAILURE ANALYSIS — ${analysis.summary.analyzedAt}`);
  console.log(`${'═'.repeat(78)}`);
  console.log(`  Total: ${totalTests}  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Pass Rate: ${analysis.summary.passRate}\n`);

  // Category summary across all modules
  const categoryCounts = new Map<string, number>();
  for (const f of failures) {
    categoryCounts.set(f.category, (categoryCounts.get(f.category) || 0) + 1);
  }
  if (categoryCounts.size > 0) {
    console.log('  Failure Categories:');
    const sorted = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted) {
      const bar = '█'.repeat(Math.min(count, 40));
      console.log(`    ${cat.padEnd(22)} ${String(count).padStart(4)}  ${bar}`);
    }
    console.log('');
  }

  // Per-module breakdown
  const moduleOrder = [...Object.entries(moduleAnalysis)]
    .map(([mod, cats]) => {
      const total = Object.values(cats).reduce((s, c) => s + c.count, 0);
      return { mod, total, cats };
    })
    .sort((a, b) => b.total - a.total);

  for (const { mod, total, cats } of moduleOrder) {
    console.log(`  ${mod} (${total} failures):`);
    const catEntries = Object.entries(cats).sort((a, b) => b[1].count - a[1].count);
    for (const [cat, bucket] of catEntries) {
      console.log(`    ${cat.padEnd(22)} ${bucket.count}`);
      // Show up to 3 test IDs per category
      for (const t of bucket.testIds.slice(0, 3)) {
        const shortErr = t.error.split('\n')[0].substring(0, 80);
        console.log(`      ${t.testId}: ${shortErr}`);
      }
      if (bucket.testIds.length > 3) {
        console.log(`      ... and ${bucket.testIds.length - 3} more`);
      }
    }
    console.log('');
  }

  console.log(`${'═'.repeat(78)}\n`);
}

main();
