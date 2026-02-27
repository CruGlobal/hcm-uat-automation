---
name: dl
description: Update the decisions log with business decisions made in this session
---

You are helping the user document business decisions made during this conversation. Follow these steps:

## Step 1: Determine the Relevant Decision Log

Analyze the conversation to identify which module/area was being worked on. Look for:
- File paths mentioned or edited (e.g., `payroll/balances/...` → payroll balances area)
- Table names referenced (e.g., `migration.payroll_balances` → payroll balances)
- Topics discussed (e.g., "assignment extraction" → core_hr/assignment)

Then search for existing DECISION_LOG.md files:
```
Find all **/DECISION_LOG.md files in the project
```

Match the conversation context to the appropriate decision log:
- `payroll/balances/DECISION_LOG.md` - Payroll balance extraction, W2 validation, earnings/deductions/taxes
- `payroll/payroll_relationships/DECISION_LOG.md` - Payroll relationship extraction
- `core_hr/assignment/DECISION_LOG.md` - Assignment extraction, cleansed_jobs, lifecycle events
- `benefits/*/DECISION_LOG.md` - Benefits-related decisions

If no matching decision log exists for the area being worked on:
1. Ask the user if they want to create one in the relevant directory
2. If yes, create it with a standard header

If the context is ambiguous, ask the user which area the decisions belong to.

## Step 2: Review Conversation for Decisions

Identify any business decisions made, including:
- Data filtering or inclusion criteria changes
- Mapping or transformation logic decisions
- Policy decisions about edge cases
- Architecture or design choices
- Scope decisions (what to include/exclude)
- Workarounds or temporary solutions agreed upon

## Step 3: Read Existing Decision Log

Read the identified DECISION_LOG.md file to:
- See what's already documented (avoid duplicates)
- Match the existing format and structure
- Find where to append new content

## Step 4: Append New Decisions

Add a new session section with today's date and entries for each decision:

```markdown
---

## Session: YYYY-MM-DD

### Business Decisions Made

#### 1. Decision Title
**Context:** Why was this decision needed?
**Decision:** What was decided?
**Rationale:** Why was this the right choice?
**Impact:** What does this affect? (or **Files Changed:** if applicable)
```

## Step 5: Report to User

Show the user:
- Which decision log was updated
- Summary of decisions added
- Any decisions that were skipped (already documented)

## Creating a New Decision Log

If creating a new DECISION_LOG.md, use this template:

```markdown
# [Module Name] Decision Log

This document tracks business decisions made during the [module description].

---

## Session: YYYY-MM-DD

### Business Decisions Made

[decisions here]
```

## IMPORTANT

- Only document decisions that have business impact
- Be concise but include enough context for future reference
- Don't duplicate decisions already in the log
- If no new decisions were made, tell the user
- Always confirm which file will be updated before making changes
