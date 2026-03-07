import fs from 'fs';
import path from 'path';

/** Static identity for a bot user (no credentials). */
export interface BotUserIdentity {
  botName: string;
  sheetName: string;
  personNumber: string;
}

/** Credentials for a bot user. */
export interface BotCredentials {
  username: string;
  password: string;
  /** TOTP secret for Okta MFA. Empty/omitted = direct Oracle login (no SSO). */
  totpSecret?: string;
}

/**
 * Static registry mapping UAT Plan testerName (sheetName) → bot user identity.
 *
 * Multiple tester names can map to the same bot account (aliases).
 * The session manager tracks by botName to avoid unnecessary re-logins
 * when consecutive tests use different tester names but the same bot.
 *
 * 19 bot accounts. Each tester maps to a dedicated bot user with Oracle native login.
 */
const BOT_USERS: BotUserIdentity[] = [
  // ── Primary mappings (original tester → bot) ──
  { botName: 'bot_hr_generalist_no_nid', sheetName: 'Angela Fairconeture', personNumber: '10816985' },
  { botName: 'bot_comp_spec', sheetName: 'Barb Beecher', personNumber: '10816991' },
  { botName: 'bot_line_manager', sheetName: 'Corey Park', personNumber: '10816992' },
  { botName: 'bot_hr_crisis', sheetName: 'Crystal Dunaway', personNumber: '10816993' },
  { botName: 'bot_payroll_admin', sheetName: 'Grace George', personNumber: '10816994' },
  { botName: 'bot_hr_admin', sheetName: 'Greg Johnson', personNumber: '10816995' },
  { botName: 'bot_vp_approver', sheetName: 'Michelle Kern', personNumber: '10816999' },
  { botName: 'bot_div_approver', sheetName: 'Matt Griffith', personNumber: '10817000' },
  { botName: 'bot_hr_local_campus', sheetName: 'Kelly Verge', personNumber: '10817001' },
  { botName: 'bot_hr_local_global_crisis', sheetName: 'Mark Kohman', personNumber: '10817002' },
  { botName: 'bot_hr_local_global', sheetName: 'Regina Clark', personNumber: '10817003' },
  { botName: 'bot_local_campus', sheetName: 'Steve Clark', personNumber: '10817004' },
  { botName: 'bot_hr_local_usops', sheetName: 'Kelly Murray', personNumber: '10817005' },
  { botName: 'bot_hr_local_familylife', sheetName: 'Lauren Erquhart', personNumber: '10817006' },
  { botName: 'bot_hr_generalist', sheetName: 'Phil Stump', personNumber: '10817007' },
  { botName: 'bot_benefit_admin', sheetName: 'Santi Torres', personNumber: '10817008' },
  { botName: 'bot_local_us_capacity', sheetName: 'David Soncrant', personNumber: '10817009' },
  { botName: 'bot_payroll_spec', sheetName: 'Janet Vankirk', personNumber: '10817013' },
  { botName: 'bot_comp_comm_approver', sheetName: 'Jim Bengston', personNumber: '10817014' },
  { botName: 'bot_time_admin', sheetName: 'Time Admin Bot', personNumber: '10818206' },

  // ── Alias mappings (unmapped testers → load-balanced across bots) ──
  // Greedy assignment: largest tester → lightest bot, all bots have comprehensive roles.
  { botName: 'bot_hr_crisis', sheetName: 'Hailey McTee', personNumber: '10816993' },           // +114
  { botName: 'bot_vp_approver', sheetName: 'Nancy Eavenson', personNumber: '10816999' },       // +84
  { botName: 'bot_div_approver', sheetName: 'Mike Hershey', personNumber: '10817000' },        // +82
  { botName: 'bot_hr_local_familylife', sheetName: 'Lisa Mitchell', personNumber: '10817006' },// +81
  { botName: 'bot_comp_spec', sheetName: 'Lisa Franklin', personNumber: '10816991' },          // +57
  { botName: 'bot_line_manager', sheetName: 'Matt Gullige', personNumber: '10816992' },        // +45
  { botName: 'bot_local_us_capacity', sheetName: 'Bethany George', personNumber: '10817009' }, // +44
  { botName: 'bot_hr_generalist_no_nid', sheetName: 'Tim Sisco', personNumber: '10816985' },   // +38
  { botName: 'bot_hr_local_global_crisis', sheetName: 'Amanda Maddex', personNumber: '10817002' }, // +35
  { botName: 'bot_hr_local_global', sheetName: 'Kim Tennison', personNumber: '10817003' },     // +24
  { botName: 'bot_hr_generalist', sheetName: 'Paul Gladney', personNumber: '10817007' },       // +22
  { botName: 'bot_hr_local_campus', sheetName: 'Ada Morgan', personNumber: '10817001' },       // +17
  { botName: 'bot_benefit_admin', sheetName: 'Jason Price', personNumber: '10817008' },         // +14
  { botName: 'bot_payroll_admin', sheetName: 'John Rygh', personNumber: '10816994' },           // +13
  { botName: 'bot_hr_local_global_crisis', sheetName: 'Leyda Ortega', personNumber: '10817002' }, // +10
  { botName: 'bot_hr_generalist_no_nid', sheetName: 'Amanda Nelson', personNumber: '10816985' }, // +10
  { botName: 'bot_line_manager', sheetName: 'Jairo Hernandez', personNumber: '10816992' },     // +10
  { botName: 'bot_local_us_capacity', sheetName: 'Lisa Copeland', personNumber: '10817009' },  // +7
  { botName: 'bot_hr_local_global', sheetName: 'Hannah Wells', personNumber: '10817003' },     // +6
  { botName: 'bot_hr_local_campus', sheetName: 'Robin Ronk', personNumber: '10817001' },       // +3
  { botName: 'bot_hr_local_global', sheetName: 'Martha Oliver', personNumber: '10817003' },    // +3
  { botName: 'bot_hr_generalist', sheetName: 'Alicia Davis', personNumber: '10817007' },       // +3
  { botName: 'bot_local_us_capacity', sheetName: 'Stephanie Slayton', personNumber: '10817009' }, // +3
  { botName: 'bot_benefit_admin', sheetName: 'Melanie Hanlon', personNumber: '10817008' },     // +3
  { botName: 'bot_local_campus', sheetName: 'Vanessa McKenna', personNumber: '10817004' },     // +2
  { botName: 'bot_hr_local_campus', sheetName: 'Ana Diaz', personNumber: '10817001' },         // +1
  { botName: 'bot_hr_generalist_no_nid', sheetName: 'Julianne Hope', personNumber: '10816985' }, // +1
  { botName: 'bot_hr_local_global', sheetName: 'Jodie Cortez', personNumber: '10817003' },     // +1
  { botName: 'bot_comp_spec', sheetName: 'Lisa or Matt', personNumber: '10816991' },           // +1 (ambiguous)
];

/** Lookup index: normalized testerName → BotUserIdentity */
const _bySheetName = new Map<string, BotUserIdentity>();
for (const bot of BOT_USERS) {
  _bySheetName.set(bot.sheetName.toLowerCase().trim(), bot);
}

/** Default bot for tests with empty or unrecognized testerName. */
const DEFAULT_BOT: BotUserIdentity = { botName: 'bot_hr_admin', sheetName: '', personNumber: '10816995' };

/**
 * Module-specific bot overrides.
 * When a tester's tests in a specific module need a different bot
 * (e.g., because the default bot lacks the right security roles),
 * add an entry here: "testerName|module" → botName.
 */
const MODULE_BOT_OVERRIDES: Record<string, string> = {
  // Currently empty — T&L overrides moved to TEST_ID_BOT_OVERRIDES for precision
};

/**
 * Test-ID-specific bot overrides.
 * When a specific test needs a different bot than what testerName/module would assign
 * (e.g., because the assigned bot lacks enrollment or data required for that test),
 * add an entry here: testId → botName.
 *
 * bot_hr_crisis (Hailey McTee) is not enrolled in absence plans, so absence tests
 * requiring plan enrollment (Disburse Balance, Review Accrual, Balance Adjustment,
 * Delete Enrollment) are routed to bot_payroll_admin (Grace George) instead.
 */
const TEST_ID_BOT_OVERRIDES: Record<string, string> = {
  // Absence admin tests needing Schedule and Monitor Processes → bot_hr_admin
  'AB-015.00': 'bot_hr_admin',
  'AB-016.00': 'bot_hr_admin',
  'AB-023.00': 'bot_hr_admin',
  // Absence tests needing plan enrollment → bot_payroll_admin
  'AB-054.00': 'bot_payroll_admin',
  'AB-056.00': 'bot_payroll_admin',
  'AB.021.00': 'bot_payroll_admin',
  'AB.022.00': 'bot_payroll_admin',
  'AB.027.00': 'bot_payroll_admin',
  // T&L HR Specialist tests → bot_time_admin (needs Time and Labor Manager role)
  'TL-001': 'bot_time_admin',
  'TL-003': 'bot_time_admin',
  'TL-004': 'bot_time_admin',
  'TL-005': 'bot_time_admin',
  'TL-006': 'bot_time_admin',
  'TL-007': 'bot_time_admin',
  'TL-053': 'bot_time_admin',
  'TL-054': 'bot_time_admin',
  'TL-057': 'bot_time_admin',
  'TL-073': 'bot_time_admin',
  'TL-074': 'bot_time_admin',
  'TL-075': 'bot_time_admin',
  'TL-081': 'bot_time_admin',
  'TL-082': 'bot_time_admin',
  'TL-084': 'bot_time_admin',
  // T&L Admin/System tests → bot_time_admin
  'TL-011': 'bot_time_admin',
  'TL-033': 'bot_time_admin',
  'TL-041': 'bot_time_admin',
  'TL-091': 'bot_time_admin',
};

/**
 * Look up a bot user by testerName from the UAT Plan.
 * Handles multi-line names (first non-empty line) and slash-separated
 * multi-tester entries like "Lisa Franklin/Lisa Mitchell" (first name).
 *
 * Resolution order: testId override → module override → testerName lookup.
 *
 * All tests run with bot users — returns a default bot for empty/unmatched names.
 */
export function getBotForTester(testerName: string, module?: string, testId?: string): BotUserIdentity {
  // Check test-ID-specific overrides first
  if (testId) {
    const overrideBotName = TEST_ID_BOT_OVERRIDES[testId];
    if (overrideBotName) {
      const overrideBot = BOT_USERS.find(b => b.botName === overrideBotName);
      if (overrideBot) return overrideBot;
    }
  }

  if (!testerName) return DEFAULT_BOT;
  // UAT Plan testerName can be multi-line — take first non-empty line
  const name = testerName.split('\n').map(s => s.trim()).find(s => s.length > 0) || '';
  if (!name) return DEFAULT_BOT;

  // Check module-specific overrides first
  if (module) {
    const overrideKey = `${name.toLowerCase()}|${module.toLowerCase()}`;
    const overrideBotName = MODULE_BOT_OVERRIDES[overrideKey];
    if (overrideBotName) {
      // Find the bot identity by name
      const overrideBot = BOT_USERS.find(b => b.botName === overrideBotName);
      if (overrideBot) return overrideBot;
    }
  }

  // Try exact match first
  const exact = _bySheetName.get(name.toLowerCase());
  if (exact) return exact;
  // Try first name in slash-separated entries (e.g., "Lisa Franklin/Lisa Mitchell")
  if (name.includes('/')) {
    const firstName = name.split('/')[0].trim();
    const slashMatch = _bySheetName.get(firstName.toLowerCase());
    if (slashMatch) return slashMatch;
  }
  return DEFAULT_BOT;
}

/** Cached credentials (loaded once from disk). */
let _credentialsCache: Map<string, BotCredentials> | null = null;

const CREDENTIALS_FILE = path.resolve(process.cwd(), '.config', 'bot-credentials.json');

function loadCredentials(): Map<string, BotCredentials> {
  if (_credentialsCache) return _credentialsCache;
  _credentialsCache = new Map();
  if (fs.existsSync(CREDENTIALS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    for (const [botName, creds] of Object.entries(raw)) {
      const c = creds as BotCredentials;
      if (c.username && c.password) {
        _credentialsCache.set(botName.toLowerCase(), c);
      }
    }
  }
  return _credentialsCache;
}

/** Get credentials for a bot user by botName. */
export function getBotCredentials(botName: string): BotCredentials | undefined {
  return loadCredentials().get(botName.toLowerCase());
}

/** True if any bot user has credentials configured. */
export function isMultiUserEnabled(): boolean {
  return loadCredentials().size > 0;
}

/** Get count of bot users with credentials configured. */
export function configuredBotCount(): number {
  return loadCredentials().size;
}

/** Get all bot user identities (for sorting/grouping). */
export function getAllBotUsers(): readonly BotUserIdentity[] {
  return BOT_USERS;
}

/** Get unique base bot names (19 base bots, deduplicated from BOT_USERS). */
export function getBaseBotNames(): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const bot of BOT_USERS) {
    if (!seen.has(bot.botName)) {
      seen.add(bot.botName);
      names.push(bot.botName);
    }
  }
  return names;
}

/**
 * Bot accounts that are known to have broken Oracle OAM credentials and should
 * be excluded from parallel test distribution. Add clone names here when Oracle
 * HCM rejects their credentials (auth_cred_submit URL with no redirect to fscmUI).
 *
 * All previously-locked clone accounts have been unlocked via reset-one-bot.ts.
 * The auto-unlock logic in login.page.ts will handle any future lockouts automatically.
 */
const DISABLED_BOT_ACCOUNTS = new Set<string>([
  // empty — all accounts re-enabled after password reset on 2026-03-02
]);

/** Get clone bot names for a base bot (from credentials file). Excludes known-broken accounts. */
export function getClonesForBot(baseBotName: string): string[] {
  const creds = loadCredentials();
  const pattern = new RegExp(`^${baseBotName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+$`);
  const clones: string[] = [];
  for (const key of creds.keys()) {
    if (pattern.test(key) && !DISABLED_BOT_ACCOUNTS.has(key)) {
      clones.push(key);
    }
  }
  return clones.sort();
}
