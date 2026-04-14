# autowiki

> Your personal wiki, synthesized overnight.

Drop articles, notes, and PDFs into an Obsidian vault during the day. A nightly GitHub Action uses Claude to turn the raw inputs into a cross-linked wiki and pushes it back. Wake up, pull, and read what your past self learned.

Inspired by [Andrej Karpathy's LLM wiki pattern](https://karpathy.bearblog.dev/llm-wiki/).

## How it works

```
             You (during the day)                Claude (overnight)
   ┌───────────────────────────────┐    ┌─────────────────────────────┐
   │ Web Clipper → Raw/articles/   │    │ GitHub Action runs @ 05 UTC │
   │ Drop PDFs   → Raw/files/      │    │ Reads CLAUDE.md             │
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

The skill triggers, walks you through installing Obsidian, scaffolds the vault, wires up the GitHub Action, and hands you the remaining one-click steps (push to GitHub, install the Claude app, add your API key). You never leave the conversation.

### Alternative: manual clone into a Claude Code skills folder

If you'd rather not use the CLI, clone the repo into your skills folder directly:

```bash
git clone https://github.com/piersonmarks/autowiki ~/.claude/skills/autowiki
```

Same trigger phrases work from there.

### What the skill walks you through

1. Install [Obsidian](https://obsidian.md)
2. Run the scaffolder — creates the folder structure, `CLAUDE.md`, and `.github/workflows/nightly-synthesis.yml`, then `git init`s and makes an initial commit
3. Open the vault in Obsidian
4. Install the [Obsidian Web Clipper](https://obsidian.md/clipper) and point it at `Raw/articles/`
5. Push the repo to GitHub (`gh repo create`)
6. Install the [Claude GitHub app](https://github.com/apps/claude) on the repo
7. Set `ANTHROPIC_API_KEY` as a repo secret (`gh secret set ANTHROPIC_API_KEY`)
8. Kick off the workflow manually to verify (`gh workflow run nightly-synthesis.yml`)

From there: clip articles and drop notes during the day, `git push`, wake up to your synthesized wiki.

## Install (no agent at all)

You can also use the scaffolder directly — useful in CI, or if you don't run an AI coding agent:

```bash
git clone https://github.com/piersonmarks/autowiki /tmp/autowiki
node /tmp/autowiki/scripts/init-vault.js ~/Desktop/MyVault \
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
├── CLAUDE.md                 # The contract. Claude reads this to know what to do.
├── Raw/
│   ├── articles/             # Web Clipper output
│   └── files/                # Drop PDFs, images, screenshots here
├── Notes/                    # Your personal notes
├── Wiki/                     # Claude-maintained knowledge pages
├── Daily/                    # Nightly recaps
├── Templates/                # Obsidian templates
├── log.md                    # Append-only log of what the nightly job did
├── index.md                  # Wiki index, grouped by category
├── .gitignore
└── .github/
    └── workflows/
        └── nightly-synthesis.yml    # The nightly job
```

## The nightly job

Every night at 05:00 UTC (configurable in `.github/workflows/nightly-synthesis.yml`), GitHub runs the workflow. It:

1. Checks out the vault
2. Uses [`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action) to run a single prompt: *"Run the nightly job per CLAUDE.md."*
3. Claude reads `CLAUDE.md` and follows the synthesis steps — discovers new sources, reads them, decides whether each warrants a wiki page, creates or updates pages, cross-links them, writes the daily recap, and appends an `ingest` entry to `log.md` for every source
4. A final shell step commits any changes and pushes to `main`

The prompt is intentionally tiny. The logic lives in `CLAUDE.md` — if you want to change how synthesis works, you edit that file, not the workflow.

## Customization

The pattern is load-bearing; the specifics are not.

**Change freely:**
- The cron schedule (edit `schedule: cron:` in the workflow)
- The model (`claude_args` in the workflow)
- Folder names (just stay consistent in `CLAUDE.md`)
- Page format conventions, tone, section headers

**Don't change without thought:**
- The Raw / Notes / Wiki split by ownership — this is what makes the system safe
- The append-only `log.md` with per-file `ingest` entries — the job depends on it to know what's been processed
- The rule that `Raw/` and `Notes/` are read-only for the system

## Costs

- **GitHub Actions minutes:** a nightly run typically takes 2–15 minutes depending on how many new sources you've added. Public repos get unlimited minutes; private repos get 2,000 free/month on the free tier.
- **Claude API tokens:** usually a few thousand to a few hundred thousand tokens per night, depending on how much new content exists. See [pricing](https://claude.com/platform/api).

## Prior art & credits

- [Andrej Karpathy's LLM wiki note](https://karpathy.bearblog.dev/llm-wiki/) — the original pattern
- [Obsidian](https://obsidian.md) — the vault UI
- [Claude Code](https://claude.com/claude-code) — runs locally and in CI
- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) — the GitHub Action this project is built on

## License

MIT — see [LICENSE](LICENSE).
