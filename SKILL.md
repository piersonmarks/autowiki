---
name: autowiki
description: Set up an autowiki — an Obsidian vault backed by a git repo, with a nightly Claude Code routine that synthesizes raw sources and personal notes into a cross-linked wiki and pushes it back overnight. Use whenever the user says "set up autowiki," "create an autowiki," "initialize a second brain," "build an LLM-maintained knowledge base," "start a personal wiki Claude maintains," "run my vault as a Claude Code routine," or asks about the Raw/Notes/Wiki/Daily pattern. Also use when the user wants to bootstrap a fresh Obsidian vault that Claude will tend to over time, even if they don't explicitly mention Obsidian, routines, autowiki, or wiki.
---

# Autowiki Setup

This skill stands up an **autowiki** — a personal knowledge vault in Obsidian, backed by a git repo, with a nightly [Claude Code routine](https://docs.claude.com/en/docs/claude-code/routines) that synthesizes new material into a cross-linked wiki and pushes the updates back. The human captures sources (articles via Web Clipper, notes, PDFs) during the day. The routine runs overnight on Anthropic-managed cloud infrastructure, reads `CLAUDE.md`, synthesizes the new material, commits, and pushes. The human pulls in the morning to pick up what Claude wrote while they slept.

## The Pattern

The vault is split by **who owns what**:

| Folder | Owner | Purpose |
|--------|-------|---------|
| `Raw/` | Human writes, system reads | External sources — articles from the Web Clipper, dropped PDFs, screenshots. Immutable. |
| `Notes/` | Human writes, system reads | Personal notes — brain dumps, lists, half-baked ideas. No imposed structure. |
| `Wiki/` | System writes, human reads | LLM-maintained knowledge pages. Synthesized from Raw + Notes. Cross-linked. Freely rewritten. |
| `Daily/` | System writes, human reads | Daily recap notes from the nightly job. |
| `Templates/` | Human writes, system reads | Obsidian templates. |
| Blog symlink (optional) | Human owns, system writes only when asked | A symlink to the user's blog repo. Interactive sessions can draft posts here; the nightly job never touches it. |

**Why this split matters:** the ownership boundaries are the whole point. The human never worries about Claude overwriting their notes. Claude never guesses whether a file in `Wiki/` is safe to edit. The nightly job can aggressively rewrite the wiki because `Raw/` and `Notes/` are the authoritative inputs.

**Why a remote routine (not local cron):** the vault lives on GitHub. The routine runs on Anthropic's cloud infrastructure regardless of whether the user's laptop is awake, bills against the user's Claude subscription (no API key juggling), and commits straight back to the repo. The user pulls when they open their laptop. The same vault syncs across multiple machines — the repo is the source of truth.

## Setup Walkthrough

Do these steps in order. Several require the user to do things outside the terminal — don't try to automate them.

### Step 1 — Install Obsidian

Point the user to **https://obsidian.md** and have them download + install. Wait for confirmation before moving on. If they already have it, skip.

### Step 2 — Scaffold the vault

Run the bundled init script:

```bash
bun <skill-path>/scripts/init-vault.ts <target-directory> \
  --vault-name "<Human Readable Vault Name>" \
  [--blog-symlink <folder-name>] [--blog-path <path-to-blog-repo>]
```

Example:
```bash
bun ~/.claude/skills/autowiki/scripts/init-vault.ts ~/Desktop/AliceVault \
  --vault-name "Alice's Autowiki"
```

Bun is required (https://bun.sh — `curl -fsSL https://bun.sh/install | bash`). If the user doesn't have bun installed, point them there before running the script.

The script:
- Creates `Raw/`, `Raw/articles/`, `Raw/files/`, `Notes/`, `Wiki/`, `Daily/`, `Templates/`
- Writes a customized `CLAUDE.md` from the template
- Seeds `log.md` and `index.md`
- Writes `.gitignore`
- Runs `git init` on branch `main` and makes an initial commit

**Ask the user for their vault path and name before running.** Don't guess. If they want a blog symlink, ask for both the folder name and the path to their blog repo — the script will create the symlink when both are provided.

If the initial `git commit` step fails (e.g., due to GPG/SSH signing config issues), the files are still written correctly — the user can commit manually after.

### Step 3 — Open the vault in Obsidian

Have the user open Obsidian → "Open folder as vault" → pick the directory you just scaffolded. Confirm the folders appear in the sidebar before moving on.

### Step 4 — Install the Obsidian Web Clipper

The Web Clipper turns any webpage into a clean markdown file in `Raw/articles/`. Download from **https://obsidian.md/clipper**. After install, the user needs to configure:

- Set the destination folder to `Raw/articles/`
- Set the vault to the one just created

Tell the user: "Try clipping an article to make sure it lands in `Raw/articles/`."

### Step 5 — Push the vault to GitHub

The routine needs a GitHub repo to clone from and push back to. If the user has the `gh` CLI installed and authenticated:

```bash
cd <vault-directory>
gh repo create <repo-name> --source=. --private --push
```

If they prefer the web UI: create an empty repo on github.com, then `git remote add origin <url>` and `git push -u origin main` from the vault.

**Default to private.** A knowledge vault often has personal/work material in it — the user should opt into public, not default into it.

### Step 6 — Create the nightly routine

Routines require a Pro, Max, Team, or Enterprise Claude plan. If the user is on the free tier, point them there before proceeding.

From inside any Claude Code session, run:

```
/schedule daily at 05:00 UTC: Run the nightly job per CLAUDE.md.
```

Claude Code will walk through repository selection, environment, and connectors. Steer the user through:

- **Repository:** the GitHub repo they just pushed. If `/schedule` prompts them to run `/web-setup` for GitHub access, have them do so.
- **Environment:** Default is fine. If they want PDF/docx extraction inside the routine, they can add `pip install python-docx pdfplumber pypdf` to the environment's setup script via [claude.ai/code/routines](https://claude.ai/code/routines).
- **Connectors:** remove anything the routine doesn't need. Slack or Linear connectors can stay if the user wants the routine to post summaries or open tickets.
- **Prompt:** `Run the nightly job per CLAUDE.md.` — nothing more. All logic lives in `CLAUDE.md`.
- **Model:** Opus if they want the best synthesis quality; Sonnet for cost/speed.

### Step 7 — Enable unrestricted branch pushes

By default, routines can only push to `claude/`-prefixed branches. Autowiki needs to push directly to `main` so the user can `git pull` in the morning without merging PRs.

Have the user:

1. Open [claude.ai/code/routines](https://claude.ai/code/routines)
2. Click into the routine they just created
3. Click the pencil icon to edit
4. Under the repository entry, enable **Allow unrestricted branch pushes**
5. Save

Without this toggle, the final `git push` in Step 10 of `CLAUDE.md` will be rejected.

### Step 8 — Trigger the routine once to verify

On the routine's detail page at [claude.ai/code/routines](https://claude.ai/code/routines), click **Run now**. A new session opens; watch it live.

If the vault has no sources yet, the run should complete quickly, append a `no-changes` line to `log.md`, and either push nothing or push an empty log update. If it errors, the most common causes are:

- GitHub access not granted (rerun `/web-setup`)
- Repo selected in the routine doesn't match the one pushed to GitHub
- "Allow unrestricted branch pushes" not enabled → push rejected
- Subscription out of routine runs for the day → Settings → Billing → enable extra usage

### Step 9 — Daily usage

Show the user the steady-state flow:

1. **Morning:** `git pull` — grab what the routine wrote.
2. **Throughout the day:** clip articles with Web Clipper, jot notes in `Notes/`, drop files in `Raw/files/`.
3. **Before close of day:** `git add -A && git commit -m "captured N sources" && git push` — so the routine sees them.
4. **Overnight (default 05:00 UTC):** the routine runs synthesis, commits updates to `Wiki/`, `Daily/`, `log.md`, `index.md`, and pushes.
5. **Repeat.**

If the user works across multiple machines, the git repo keeps them in sync — same flow on each.

## Customization Guidance

The pattern is load-bearing; the specifics are not.

**Load-bearing (don't change without thought):**
- The Raw/Notes/Wiki split by ownership — this is what makes the system safe and sustainable.
- The append-only `log.md` with per-file `ingest` entries — the nightly job depends on this to know what's been processed.
- The rule that `Raw/` and `Notes/` are read-only for the system.
- The commit-and-push step at the end of synthesis — the routine's session is responsible for pushing back; skipping it means the user never sees the work.

**Fine to change:**
- Folder names (if the user prefers `Sources/` over `Raw/`, that's fine — just be consistent in `CLAUDE.md`).
- Page format conventions.
- Routine schedule (edit the routine on claude.ai/code/routines, or via `/schedule update` in the CLI).
- Model (change on the routine's edit page).
- Adding API or GitHub-event triggers alongside the schedule (useful for "resynthesize on demand after a big clipping session" via `curl`).
- Adding new folders for specific use cases (`Meetings/`, `Projects/`).

When the user asks to adapt the template, update the `CLAUDE.md` in their vault.

## What Not to Do

- Don't write test content into `Raw/` or `Notes/` — those are human-owned. If you want to demo the routine, tell the user to add a source themselves.
- Don't automate the Obsidian install, Web Clipper install, or the claude.ai routine-editing steps — all are GUI-driven.
- Don't skip the "confirm it works" beats in steps 1, 3, 4, 8. Silent failures here are painful to debug later.
- Don't fall back to the old GitHub Actions path unless the user explicitly asks — `ANTHROPIC_API_KEY` in repo secrets and a committed workflow file are not part of this setup.

## Reference Files

- `references/urls.md` — canonical links for Obsidian, Web Clipper, Claude Code, and the routines docs.
- `references/routine-setup.md` — detailed steps and troubleshooting for the routine side (schedule, permissions, extra usage, triggering via API).
- `assets/CLAUDE.md.template` — the template the init script uses. Read this to understand what gets written into the user's vault, especially the synthesis workflow the routine executes.
- `assets/gitignore.template` — what's excluded from git (Obsidian workspace files, OS junk).
- `scripts/init-vault.ts` — the scaffolding script (Bun + TypeScript). Read before running for an unusual target.
