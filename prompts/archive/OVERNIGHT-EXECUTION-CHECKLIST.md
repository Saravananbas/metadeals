# Overnight Execution Checklist

## Before starting

- [ ] Extract prompts into `D:\Metadeals\prompts`.
- [ ] Open the correct repository root in VS Code.
- [ ] Confirm the machine is connected to power and will not sleep.
- [ ] Confirm GitHub Copilot is signed in and Agent mode is selected.
- [ ] Check current Git branch and `git status`.
- [ ] Commit or otherwise safely preserve existing user work.
- [ ] Attach the approved homepage reference image for M1.5.
- [ ] Confirm `.env` is ignored and no secrets are in the repository.
- [ ] Keep all integrations in mock mode.

## While running

- [ ] Copilot is actively executing; a submitted prompt alone does not guarantee background execution.
- [ ] Approve only understood, safe terminal commands.
- [ ] Do not approve destructive database commands, resets or production actions.
- [ ] If Copilot pauses or hits a usage limit, resume later using the latest module report.
- [ ] Check reports are created after each module.

## Tomorrow morning

- [ ] Read the master execution summary.
- [ ] Read each module completion report.
- [ ] Review `KNOWN-ISSUES.md`.
- [ ] Review screenshots.
- [ ] Inspect `git status` and commit history.
- [ ] Run the app locally.
- [ ] Verify no real messages were sent and no production deployment occurred.
- [ ] Fix issues in a separate, controlled pass.
