---
name: gc
description: Git commit workflow - stages changes and creates a commit following best practices
---

You are helping the user create a git commit following industry best practices. Follow these steps:

1. Run git status and git diff in parallel to see untracked files and changes

2. Analyze the changes and draft a commit message following these best practices:
   - Use imperative mood ("Add feature" not "Added feature" or "Adds feature")
   - Start with a capitalized verb (Add, Fix, Update, Refactor, Remove, etc.)
   - Keep subject line under 50 characters if possible, max 72
   - Don't end subject line with a period
   - Focus on WHAT and WHY, not HOW
   - Be specific about what changed (not just "Update files")
   - If needed, add a blank line and body with more context

3. Add relevant untracked files to staging

4. Create the commit with message ending in:
   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

5. Run git status after commit to verify success

EXAMPLE GOOD MESSAGES:
- "Add validation rules for assignment termination dates"
- "Fix duplicate hire date detection in assignment pipeline"
- "Refactor CTE tests to support multiple templates"
- "Update payroll balance extraction to include state taxes"

IMPORTANT:
- Use HEREDOC format for commit messages for proper formatting
- NEVER update git config
- NEVER run destructive git commands unless explicitly requested
- NEVER skip hooks (--no-verify)
- NEVER use --amend unless explicitly requested
- Prefer adding specific files by name rather than 'git add -A' or 'git add .'
- DO NOT push to remote unless explicitly requested
- If there are no changes, do not create an empty commit
