# Routine Setup

The nightly synthesis job runs as a [Claude Code routine](https://docs.claude.com/en/docs/claude-code/routines) on Anthropic-managed cloud infrastructure. This file is the detailed reference for the routine-side setup and the most common things that go wrong.

## Why routines (vs GitHub Actions)

- No `ANTHROPIC_API_KEY` to manage — the routine bills against the user's Claude subscription.
- No workflow YAML to maintain. Schedule + prompt live on the routine, not in the repo.
- No GitHub Actions minutes consumed.
- Runs on Anthropic's cloud with the latest Claude Code capabilities — no action version bumps.
- API and GitHub-event triggers are available alongside the schedule. A `curl` can kick off synthesis on demand; a `push` to `main` can fire a re-synthesis.

Tradeoff: routines require a Pro/Max/Team/Enterprise Claude plan. The free tier cannot use them.

## What the routine does

The routine's saved prompt is intentionally tiny:

```
Run the nightly job per CLAUDE.md.
```

On each run the routine:

1. Clones the vault repo on the default branch.
2. Starts a full Claude Code session.
3. The session reads `CLAUDE.md` and executes the synthesis steps end-to-end.
4. The session commits changes and pushes back to `main`.

`CLAUDE.md` is the source of truth for what the job does. To change behavior, edit `CLAUDE.md`, not the routine.

## Required one-time configuration

- **GitHub access for Claude:** the user's claude.ai account must have GitHub access to clone the vault repo. If `/schedule` doesn't detect it, run `/web-setup` in Claude Code to grant access.
- **Unrestricted branch pushes:** routines default to `claude/`-prefixed branches. Autowiki pushes directly to `main` so the user can `git pull` in the morning. Enable **Allow unrestricted branch pushes** for the vault repository on the routine's edit page at [claude.ai/code/routines](https://claude.ai/code/routines).
- **Environment (optional):** if the vault contains PDFs or `.docx` files, add `pip install --quiet python-docx pdfplumber pypdf` to the environment's setup script so the routine can extract text from them. Default environment is fine for pure markdown vaults.

## Scheduling

Routine schedules are entered in the user's local timezone and auto-converted, so the routine fires at the same wall-clock time regardless of where the cloud infra lives. Runs may start a few minutes after the scheduled time due to stagger — the offset is consistent per routine.

Default cadence suggestions:

- Daily at 05:00 UTC ≈ 00:00 ET / 21:00 PT (previous day)
- Daily at 06:00 UTC ≈ 01:00 ET / 22:00 PT (previous day)
- Daily at 04:00 UTC ≈ 23:00 ET / 20:00 PT (previous day)

Minimum interval is 1 hour. For custom intervals, pick the closest preset in the web UI, then run `/schedule update` in the CLI to set a specific cron expression.

## Extra triggers

Routines can combine multiple triggers. For autowiki, useful additions:

- **API trigger**: generate a bearer token on the routine's edit page, then `curl` the `/fire` endpoint after a big clipping session to resynthesize on demand instead of waiting for the next scheduled run.
- **GitHub event trigger**: fire on `push` to `main` — every commit that adds new Raw/Notes content triggers synthesis. Skip this if the user prefers predictable once-per-day cadence.

Both are configured from the routine's edit page at [claude.ai/code/routines](https://claude.ai/code/routines).

## Troubleshooting

**`git push` rejected — "Branch push restricted".**
"Allow unrestricted branch pushes" is not enabled for the repository. Open the routine at claude.ai/code/routines → edit → toggle it on for the vault repo → save.

**Routine starts but commits nothing, and `log.md` shows no new `ingest` entries.**
Usually means the routine's Claude Code session either couldn't find the sources or decided every source was "no wiki action". Open the routine run from [claude.ai/code/routines](https://claude.ai/code/routines) → the run links to a full session you can replay. Look for the `find` output in Step 2 and check whether `Raw/` and `Notes/` were actually discovered.

**Routine hit the daily cap.**
Each claude.ai account has a daily routine-run allowance on top of the standard subscription limits. See consumption at [claude.ai/settings/usage](https://claude.ai/settings/usage). Enable extra usage from **Settings > Billing** if you want runs to keep going on metered overage.

**Routine runs a bit late.**
Expected. Stagger delays runs by a few minutes past the scheduled time. Don't pick a time when the exact minute matters.

**Commits show up as the user (not a bot).**
Routines act as the user's linked GitHub identity. This is working as intended. If you want bot-flavored commits, add `git config user.name claude-nightly[bot]` and a matching email to Step 10 of the synthesis workflow in `CLAUDE.md`.

## Local testing without waiting for cron

Two options:

1. On [claude.ai/code/routines](https://claude.ai/code/routines), open the routine and click **Run now**. Identical behavior to a scheduled run, immediately.
2. Run the same prompt locally in an interactive Claude Code session at the vault root: `Run the nightly job per CLAUDE.md.` — identical synthesis logic, just without the commit/push step at the end (Step 10 of `CLAUDE.md` tells interactive sessions to stop before committing). This is the fastest way to iterate on `CLAUDE.md` changes.
