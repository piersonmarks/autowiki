# autowiki

> Your personal wiki, synthesized overnight.

Drop articles, notes, and PDFs into an Obsidian vault during the day. A nightly [Claude Code routine](https://docs.claude.com/en/docs/claude-code/routines) turns the raw inputs into a cross-linked wiki and pushes it back. Wake up, pull, and read what your past self learned.

Inspired by [Andrej Karpathy's LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## How it works

```
             You (during the day)                Claude (overnight)
   ┌───────────────────────────────┐    ┌─────────────────────────────┐
   │ Web Clipper → Raw/articles/   │    │ Routine fires @ 05 UTC      │
   │ Drop PDFs   → Raw/files/      │    │ Clones repo, reads CLAUDE.md│
   │ Jot notes   → Notes/          │    │ Synthesizes → Wiki/         │
   │ git push                      │    │ Writes Daily/YYYY-MM-DD.md  │
   └──────────────┬────────────────┘    │ git commit && git push      │
                  │                     └──────────────┬──────────────┘
                  │                                    │
                  └────────── GitHub repo ─────────────┘
                                   │
                  ┌────────────────▼─────────────────┐
                  │  git pull in the morning         │
                  └──────────────────────────────────┘
```

The vault is split by **who owns what**:

| Folder | Owner | Purpose |
|--------|-------|---------|
| `Raw/` | You write, Claude reads | External sources — clipped articles, dropped PDFs, screenshots. Immutable. |
| `Notes/` | You write, Claude reads | Brain dumps, lists, half-baked ideas. No imposed structure. |
| `Wiki/` | Claude writes, you read | LLM-maintained knowledge pages. Synthesized from Raw + Notes. Cross-linked. Freely rewritten. |
| `Daily/` | Claude writes, you read | Daily recaps from the nightly job. |
| `Templates/` | You own | Obsidian templates. |

This split is the whole point: you never worry about Claude overwriting your notes, and Claude never guesses whether a file in `Wiki/` is safe to edit. The nightly job can aggressively rewrite the wiki because `Raw/` and `Notes/` are the authoritative inputs.

## Install

### Recommended: via [skills.sh](https://skills.sh)

One command, works across Claude Code, Cursor, Codex, OpenCode, and 40+ other agents:

```bash
npx skills add piersonmarks/autowiki -g
```

The `-g` installs globally so it's available across every project. Drop it if you want to scope the skill to the current project.

Then open your agent and say something like:

```
set up an autowiki at ~/Desktop/MyVault
```

The skill triggers, walks you through installing Obsidian, scaffolds the vault, and hands you the remaining one-click steps (push to GitHub, create the routine with `/schedule`, toggle unrestricted branch pushes). You never leave the conversation.

### Alternative: manual clone into a Claude Code skills folder

If you'd rather not use the CLI, clone the repo into your skills folder directly:

```bash
git clone https://github.com/piersonmarks/autowiki ~/.claude/skills/autowiki
```

Same trigger phrases work from there.

### What the skill walks you through

1. Install [Obsidian](https://obsidian.md)
2. Run the scaffolder — creates the folder structure, `CLAUDE.md`, and `.gitignore`, then `git init`s and makes an initial commit
3. Open the vault in Obsidian
4. Install the [Obsidian Web Clipper](https://obsidian.md/clipper) and point it at `Raw/articles/`
5. Push the repo to GitHub (`gh repo create`)
6. Create the nightly routine from inside Claude Code:
   ```
   /schedule daily at 05:00 UTC: Run the nightly job per CLAUDE.md.
   ```
7. At [claude.ai/code/routines](https://claude.ai/code/routines), edit the routine and enable **Allow unrestricted branch pushes** so it can push to `main`
8. Click **Run now** on the routine once to verify

From there: clip articles and drop notes during the day, `git push`, wake up to your synthesized wiki.

## Install (no agent at all)

You can also use the scaffolder directly — useful in CI, or if you don't run an AI coding agent. Requires [Bun](https://bun.sh):

```bash
git clone https://github.com/piersonmarks/autowiki /tmp/autowiki
bun /tmp/autowiki/scripts/init-vault.ts ~/Desktop/MyVault \
  --vault-name "My Autowiki"
```

Flags:

```
--vault-name "<name>"            (required)   Human-readable name used in CLAUDE.md.
--blog-symlink <folder-name>     (optional)   Scaffold a symlink into a blog repo.
--blog-path <absolute-path>      (optional)   Path to the blog repo to link.
--force                          (optional)   Overwrite files that already exist.
--no-git                         (optional)   Skip git init + initial commit.
```

Then follow steps 3–8 from the skill walkthrough manually.

## What gets scaffolded

```
MyVault/
├── CLAUDE.md       # The contract. Claude reads this to know what to do.
├── Raw/
│   ├── articles/   # Web Clipper output
│   └── files/      # Drop PDFs, images, screenshots here
├── Notes/          # Your personal notes
├── Wiki/           # Claude-maintained knowledge pages
├── Daily/          # Nightly recaps
├── Templates/      # Obsidian templates
├── log.md          # Append-only log of what the nightly job did
├── index.md        # Wiki index, grouped by category
└── .gitignore
```

No GitHub Actions workflow. No `ANTHROPIC_API_KEY` secret. The schedule and prompt live on the routine, not in the repo.

## Tech stack

The scaffolder runs on **Bun + TypeScript** (`scripts/init-vault.ts`). The vault itself is plain markdown — no runtime dependency on Bun, Node, or anything else after scaffolding. The nightly job runs as a [Claude Code routine](https://docs.claude.com/en/docs/claude-code/routines) on Anthropic-managed cloud infrastructure.

## The nightly job

Every night at 05:00 UTC (or whatever cadence you set when creating the routine), Anthropic's cloud fires the routine. It:

1. Clones the vault repo on the default branch
2. Runs a full Claude Code session with the prompt: *"Run the nightly job per CLAUDE.md."*
3. Claude reads `CLAUDE.md` and follows the synthesis steps — discovers new sources, reads them, decides whether each warrants a wiki page, creates or updates pages, cross-links them, writes the daily recap, and appends an `ingest` entry to `log.md` for every source
4. The session commits any changes and pushes back to `main`

The prompt is intentionally tiny. The logic lives in `CLAUDE.md` — if you want to change how synthesis works, you edit that file, not the routine.

**Why routines instead of GitHub Actions?** No API key to manage (billed against your Claude subscription), no YAML to maintain, no Actions minutes consumed, and the routine can combine the schedule with API triggers (`curl` to resynthesize on demand) or GitHub-event triggers (resynthesize on `push`). Requires a Pro, Max, Team, or Enterprise Claude plan.

## Customization

The pattern is load-bearing; the specifics are not.

**Change freely:**
- The routine schedule (edit on [claude.ai/code/routines](https://claude.ai/code/routines) or via `/schedule update`)
- The model (routine edit page)
- Folder names (just stay consistent in `CLAUDE.md`)
- Page format conventions, tone, section headers
- Adding API or GitHub-event triggers alongside the schedule

**Don't change without thought:**
- The Raw / Notes / Wiki split by ownership — this is what makes the system safe
- The append-only `log.md` with per-file `ingest` entries — the job depends on it to know what's been processed
- The rule that `Raw/` and `Notes/` are read-only for the system
- The commit/push at the end of Step 10 — without it, the routine's work never lands in your repo

## Costs

- **Routine runs:** each run consumes routine allowance from your Claude subscription. Pro/Max/Team/Enterprise plans have daily routine caps; enable extra usage in **Settings > Billing** to keep running on metered overage.
- **GitHub storage:** a text vault is a rounding error on any GitHub plan.

No API key charges. No Actions minutes.

## Prior art & credits

- [Andrej Karpathy's LLM wiki note](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — the original pattern
- [Obsidian](https://obsidian.md) — the vault UI
- [Claude Code](https://claude.com/claude-code) — runs locally and as a routine
- [Claude Code Routines](https://docs.claude.com/en/docs/claude-code/routines) — the scheduler this project is built on

## License

MIT — see [LICENSE](LICENSE).
