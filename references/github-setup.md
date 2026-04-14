# GitHub Setup

The nightly synthesis job runs as a GitHub Action on the vault's repo. This file is the detailed reference for the GitHub-side setup and the most common things that go wrong.

## Why GitHub Actions

- The runner is awake even when the user's laptop is asleep.
- The vault repo is already the source of truth, so commit-back is the natural integration point.
- `anthropics/claude-code-action@v1` is maintained by Anthropic and stays current with Claude Code's capabilities without us needing to rebuild anything.
- The same workflow can be kicked off manually for testing (`workflow_dispatch`).

## What the workflow does

See `assets/nightly-synthesis.yml.template` for the full file. The sequence is:

1. `actions/checkout@v4` — checks out the vault with full history.
2. `pip install python-docx pdfplumber pypdf` — installs the libraries the synthesis prompt needs to read PDFs and .docx sources.
3. `anthropics/claude-code-action@v1` — runs the prompt `Run the nightly job per CLAUDE.md.`. The action mounts the repo, spawns Claude Code, and lets it write to the filesystem.
4. A final bash step stages, commits, and pushes any changes. Uses a bot identity so the commits don't look like they came from the repo owner.

The prompt is intentionally tiny — `CLAUDE.md` is the source of truth for what the job does. If the user wants to change behavior, they edit `CLAUDE.md`, not the workflow.

## Required one-time configuration

- **GitHub App:** Install https://github.com/apps/claude on the vault repo. Without this, the action will fail to authenticate to GitHub for the commit/push step.
- **Secret:** `ANTHROPIC_API_KEY` — from https://console.anthropic.com. Set with `gh secret set ANTHROPIC_API_KEY` or via Settings → Secrets and variables → Actions.
- **Workflow permissions:** Settings → Actions → General → Workflow permissions → "Read and write permissions". The workflow's `permissions:` block declares this at the job level, but the repo-level setting must also allow it.

## Scheduling

Cron in GitHub Actions runs in UTC. The default in the template is `0 5 * * *`:

- 05:00 UTC ≈ 00:00 ET / 21:00 PT (previous day)
- 06:00 UTC ≈ 01:00 ET / 22:00 PT (previous day)
- 04:00 UTC ≈ 23:00 ET / 20:00 PT (previous day)

GitHub's scheduler is best-effort — runs can be delayed 5–20 minutes during peak times. Don't pick a time when the exact minute matters.

Edit the `cron:` line in `.github/workflows/nightly-synthesis.yml` to change timing. Push the change and it takes effect on the next run.

## Troubleshooting

**"Resource not accessible by integration" when pushing.**
The workflow doesn't have write permission. Check: (a) the `permissions:` block in the workflow includes `contents: write`, (b) repo Settings → Actions → General → Workflow permissions is "Read and write", (c) the Claude GitHub app is installed on this repo.

**"Authentication failed" or 401 from the action.**
The `ANTHROPIC_API_KEY` secret isn't set or is wrong. Run `gh secret list --repo <owner>/<repo>` to confirm it exists. Rotate the key at console.anthropic.com if in doubt.

**Workflow runs but doesn't process any files.**
Usually a `log.md` / `find` mismatch. Check that `ingest` entries in `log.md` use vault-relative paths (e.g., `Raw/articles/foo.md`), not human-readable titles. The template writes the correct format from day one — this only trips up migrated vaults.

**Workflow commits nothing even though there are clearly new sources.**
Check the action's run log. If Claude completed without errors but wrote no files, it probably decided every source was "no wiki action." That can be correct (personal lists, novelty items) — check `log.md` for the `ingest | <path> (no wiki action — <reason>)` lines. If those are missing, something silently failed; re-run with `workflow_dispatch` and read the full log.

**Workflow pushed to a branch other than main.**
The final git step in the template uses `git push` with no branch argument, which pushes the current branch. `actions/checkout@v4` defaults to the branch that triggered the run — which for scheduled workflows is whatever the default branch is. If the user renamed `main` to something else, fine; if they're on a weird detached state, that's a problem, and you should rerun the init flow or push a fix.

**Rate limits.**
Claude API rate limits apply per organization. A nightly run typically uses a few thousand tokens to a few hundred thousand depending on how much new content exists. Heavy users with lots of sources dropped in one day may hit limits — lower the schedule frequency, or consider splitting into multiple runs.

## Local testing without waiting for cron

Kick off the workflow manually:

```bash
gh workflow run nightly-synthesis.yml --repo <owner>/<repo>
gh run watch --repo <owner>/<repo>
```

Or run the same prompt locally in an interactive Claude Code session at the vault root: `Run the nightly job per CLAUDE.md.` — identical behavior, just without the commit/push step at the end. This is the fastest way to iterate on `CLAUDE.md` changes.
