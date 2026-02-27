---
name: pr
description: Create a GitHub pull request from the current branch
---

You are helping the user create a pull request. Follow these steps:

1. Run these commands IN PARALLEL to understand the branch state:
   - git status (never use -uall flag)
   - git diff to see staged/unstaged changes
   - Check if current branch tracks remote and is up to date
   - git log and git diff [base-branch]...HEAD to see full commit history since divergence

2. Analyze ALL changes that will be included (review ALL commits, not just the latest):
   - What problem does this solve?
   - What approach was taken?
   - What are the key changes?

3. Draft a PR summary with:
   - Title: Clear, specific, imperative mood (under 72 chars)
   - Summary: 1-3 concise bullet points explaining the changes
   - Test plan: Bulleted checklist of how to test/verify the changes

4. Run these commands IN PARALLEL:
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with this format:

```bash
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
- Bullet point 1
- Bullet point 2

## Test plan
- [ ] Test step 1
- [ ] Test step 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

5. Return the PR URL to the user

IMPORTANT:
- DO NOT use TodoWrite or Task tools
- Analyze ALL commits in the branch, not just the latest
- Use HEREDOC format for PR body
- NEVER push with --force unless explicitly requested
- Default base branch is 'main' unless specified otherwise
- Make test plan actionable and specific to these changes
