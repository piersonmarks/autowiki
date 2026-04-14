---
name: autowiki
description: Set up an autowiki — an Obsidian vault backed by a git repo, with a nightly GitHub Action that uses Claude to synthesize raw sources and personal notes into a cross-linked wiki and push it back overnight. Use whenever the user says "set up autowiki," "create an autowiki," "initialize a second brain," "build an LLM-maintained knowledge base," "start a personal wiki Claude maintains," "run my vault on GitHub Actions," or asks about the Raw/Notes/Wiki/Daily pattern. Also use when the user wants to bootstrap a fresh Obsidian vault that Claude will tend to over time, even if they don't explicitly mention Obsidian, GitHub Actions, autowiki, or wiki.
---

# Autowiki Setup

This skill stands up an **autowiki** — a personal knowledge vault in Obsidian, backed by a git repo, with a nightly GitHub Action that synthesizes new material into a cross-linked wiki and pushes the updates back. The human captures sources (articles via Web Clipper, notes, PDFs) during the day. The action runs overnight, reads `CLAUDE.md`, synthesizes the new material, and commits. The human pulls in the morning to pick up what Claude wrote while they slept.

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

**Why a remote nightly job (not local cron):** the vault lives on GitHub. The action runs regardless of whether the user's laptop is awake. The synthesis happens remotely, commits land in the repo, and the user pulls when they open their laptop. This also means the same vault can be synced across multiple machines — the repo is the source of truth.

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
- Scaffolds `.github/workflows/nightly-synthesis.yml`
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

The nightly job runs on GitHub Actions, so the vault needs to be a GitHub repo. If the user has the `gh` CLI installed and authenticated:

```bash
cd <vault-directory>
gh repo create <repo-name> --source=. --private --push
```

If they prefer the web UI: create an empty repo on github.com, then `git remote add origin <url>` and `git push -u origin main` from the vault.

**Default to private.** A knowledge vault often has personal/work material in it — the user should opt into public, not default into it.

### Step 6 — Install the Claude GitHub app

The workflow uses `anthropics/claude-code-action@v1`, which needs the Claude GitHub app installed on the vault repo. Point the user to **https://github.com/apps/claude** and have them install it on the specific repo (not org-wide unless they want that).

### Step 7 — Add the ANTHROPIC_API_KEY secret

The workflow reads `secrets.ANTHROPIC_API_KEY`. Set it via `gh`:

```bash
gh secret set ANTHROPIC_API_KEY --repo <owner>/<repo>
```

Or via the web UI: Settings → Secrets and variables → Actions → New repository secret. The user needs an API key from https://console.anthropic.com if they don't have one.

### Step 8 — Trigger the workflow once to verify

The workflow has `workflow_dispatch` enabled so it can be kicked off manually:

```bash
gh workflow run nightly-synthesis.yml --repo <owner>/<repo>
gh run watch --repo <owner>/<repo>
```

If the vault has no sources yet, the run should complete quickly and append a `no-changes` line to `log.md`. If it errors, the most common causes are:
- GitHub app not installed on the repo
- `ANTHROPIC_API_KEY` secret not set
- Workflow permissions — repo settings need Actions → General → Workflow permissions set to "Read and write"

### Step 9 — Daily usage

Show the user the steady-state flow:

1. **Morning:** `git pull` — grab what the nightly job wrote.
2. **Throughout the day:** clip articles with Web Clipper, jot notes in `Notes/`, drop files in `Raw/files/`.
3. **Before close of day:** `git add -A && git commit -m "captured N sources" && git push` — so the nightly job sees them.
4. **Overnight (default 05:00 UTC):** the action runs synthesis, commits updates to `Wiki/`, `Daily/`, `log.md`, `index.md`, and pushes.
5. **Repeat.**

If the user works across multiple machines, the git repo keeps them in sync — same flow on each.

## Customization Guidance

The pattern is load-bearing; the specifics are not.

**Load-bearing (don't change without thought):**
- The Raw/Notes/Wiki split by ownership — this is what makes the system safe and sustainable.
- The append-only `log.md` with per-file `ingest` entries — the nightly job depends on this to know what's been processed.
- The rule that `Raw/` and `Notes/` are read-only for the system.
- The nightly job never running `git add` / `commit` / `push` itself — the workflow's final step handles that, and mixing the two breaks idempotency.

**Fine to change:**
- Folder names (if the user prefers `Sources/` over `Raw/`, that's fine — just be consistent in `CLAUDE.md`).
- Page format conventions.
- Nightly job schedule (edit the `cron:` in the workflow file).
- Model or `--max-turns` passed to `claude_args` in the workflow.
- Adding new folders for specific use cases (`Meetings/`, `Projects/`).

When the user asks to adapt the template, update both the `CLAUDE.md` in their vault and the workflow if relevant.

## What Not to Do

- Don't write test content into `Raw/` or `Notes/` — those are human-owned. If you want to demo the nightly job, tell the user to add a source themselves.
- Don't automate the Obsidian install, Web Clipper install, or GitHub app install — all are GUI-driven.
- Don't skip the "confirm it works" beats in steps 1, 3, 4, 8. Silent failures here are painful to debug later.
- Don't commit the `ANTHROPIC_API_KEY` anywhere in the repo. It's a secret, full stop.
- Don't push the vault as public by default. Always ask.

## Reference Files

- `references/urls.md` — canonical links for Obsidian, Web Clipper, Claude GitHub app, Claude Code Action docs.
- `references/github-setup.md` — detailed steps and troubleshooting for the GitHub side (repo creation, secrets, workflow permissions, the Claude GitHub app).
- `assets/CLAUDE.md.template` — the template the init script uses. Read this to understand what gets written into the user's vault.
- `assets/nightly-synthesis.yml.template` — the GitHub Action workflow. Read this to understand what runs overnight and how the commit/push works.
- `assets/gitignore.template` — what's excluded from git (Obsidian workspace files, OS junk).
- `scripts/init-vault.ts` — the scaffolding script (Bun + TypeScript). Read before running for an unusual target.
