---
name: gca
description: Amend the last commit with current changes
---

You are helping the user amend the last git commit with any changes since that commit. Follow these steps:

1. Run git status and git diff in parallel to see what has changed since the last commit

2. Verify there are changes to amend:
   - If there are no changes, inform the user and do not proceed
   - Show what will be added to the amended commit

3. Add relevant changed files to staging:
   - Prefer adding specific files by name rather than 'git add -A' or 'git add .'
   - Do NOT add personal config files (.bashrc, .zshrc, .gitconfig, etc.)
   - Do NOT add IDE files (.idea, .vscode, etc.)
   - Do NOT add files that should be in .gitignore

4. Amend the commit keeping the same message:
   - Use: git commit --amend --no-edit
   - This preserves the existing commit message including Co-Authored-By

5. Run git status after amend to verify success

6. Show the updated commit with: git log -1 --stat

IMPORTANT SAFETY RULES:
- NEVER update git config
- NEVER run destructive git commands beyond amend unless explicitly requested
- NEVER skip hooks (--no-verify) unless explicitly requested
- DO NOT push to remote unless explicitly requested
- Only amend the most recent commit (never use --amend with older commits)
- If the user has already pushed the commit, warn them that amending will require force push

WHEN TO USE THIS COMMAND:
- Fixing typos or small issues in the last commit
- Adding forgotten files to the last commit
- Making minor adjustments to recently committed code

WHEN NOT TO USE:
- If the commit has already been pushed to a shared branch (creates rewrite history)
- If you want to create a new commit instead (use /gc)
- If there are no changes to amend
