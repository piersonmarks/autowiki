#!/usr/bin/env bun
/**
 * init-vault.ts — Scaffold an autowiki: an Obsidian knowledge vault
 * backed by git, with a nightly GitHub Action that synthesizes new sources
 * into a cross-linked wiki.
 *
 * Usage:
 *   bun scripts/init-vault.ts <target-directory> --vault-name "<name>" [options]
 *
 * Options:
 *   --vault-name <name>           Human-readable vault name (required). Used in CLAUDE.md heading.
 *   --blog-symlink <folder-name>  Folder name for blog symlink inside the vault (optional).
 *   --blog-path <absolute-path>   Path to existing blog repo. If provided with --blog-symlink,
 *                                 a symlink is created at <vault>/<folder-name> pointing here.
 *   --force                       Overwrite existing files in the target directory.
 *   --no-git                      Skip git init + initial commit (default: git init runs).
 *
 * Example:
 *   bun scripts/init-vault.ts ~/Desktop/AliceVault \
 *     --vault-name "Alice's Autowiki" \
 *     --blog-symlink alice-blog \
 *     --blog-path ~/code/alice-blog
 */

import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type FlagValue = string | true;

interface ParsedArgs {
  positional: string[];
  flags: Record<string, FlagValue>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { positional: [], flags: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.flags[key] = next;
        i++;
      } else {
        args.flags[key] = true;
      }
    } else {
      args.positional.push(a);
    }
  }
  return args;
}

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function expandHome(p: string): string {
  if (p.startsWith("~")) {
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (!home) die("could not resolve $HOME for ~ expansion");
    return join(home, p.slice(1));
  }
  return p;
}

function mkdirSafe(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeIfAbsent(filePath: string, contents: string, force: boolean): boolean {
  if (existsSync(filePath) && !force) {
    console.log(`  skip  ${relative(process.cwd(), filePath)} (exists)`);
    return false;
  }
  writeFileSync(filePath, contents);
  console.log(`  write ${relative(process.cwd(), filePath)}`);
  return true;
}

function renderTemplate(templatePath: string, substitutions: Record<string, string>): string {
  let tpl = readFileSync(templatePath, "utf8");
  for (const [key, val] of Object.entries(substitutions)) {
    tpl = tpl.replaceAll(`{{${key}}}`, val);
  }
  return tpl;
}

interface BlogBlocks {
  BLOG_ROW: string;
  BLOG_INTERACTIVE_LINE: string;
  BLOG_RULE_LINE: string;
}

function buildBlogBlocks(blogFolder: string | null): BlogBlocks {
  if (!blogFolder) {
    return { BLOG_ROW: "", BLOG_INTERACTIVE_LINE: "", BLOG_RULE_LINE: "" };
  }
  return {
    BLOG_ROW: `\n| \`${blogFolder}/\` | Symlink to blog repo. Claude can draft/edit posts when asked. | Human: full control. System: read, write (only when explicitly requested). |`,
    BLOG_INTERACTIVE_LINE: `\n- The user can draw from the full vault when writing blog posts.\n- You may draft or edit posts in \`${blogFolder}/\` when explicitly asked. Default to \`status: "draft"\` in frontmatter so the user can review before publishing.`,
    BLOG_RULE_LINE: `\n- The nightly cron job must never write to \`${blogFolder}/\`. Interactive sessions may write there only when the user explicitly asks.`,
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function flagString(value: FlagValue | undefined): string | null {
  if (value === undefined || value === true) return null;
  return value;
}

function main(): void {
  const args = parseArgs(process.argv);
  const target = args.positional[0];
  if (!target) die('missing target directory. usage: init-vault.ts <dir> --vault-name "<name>"');

  const vaultName = flagString(args.flags["vault-name"]);
  if (!vaultName) die("--vault-name is required");

  const blogSymlink = flagString(args.flags["blog-symlink"]);
  const blogPath = flagString(args.flags["blog-path"]);
  const force = !!args.flags.force;
  const skipGit = !!args.flags["no-git"];

  const vaultDir = resolve(expandHome(target));
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const skillRoot = resolve(scriptDir, "..");
  const templatePath = join(skillRoot, "assets", "CLAUDE.md.template");

  if (!existsSync(templatePath)) die(`template not found at ${templatePath}`);

  console.log(`\nscaffolding autowiki`);
  console.log(`  target:     ${vaultDir}`);
  console.log(`  name:       ${vaultName}`);
  if (blogSymlink) {
    const linkInfo = blogPath ? ` → ${blogPath}` : " (symlink not created — no --blog-path)";
    console.log(`  blog:       ${blogSymlink}${linkInfo}`);
  }
  console.log();

  mkdirSafe(vaultDir);

  const folders = ["Raw", "Raw/articles", "Raw/files", "Notes", "Wiki", "Daily", "Templates"];
  for (const f of folders) {
    const p = join(vaultDir, f);
    mkdirSafe(p);
    // .gitkeep so empty folders survive once the vault is git-tracked.
    const keep = join(p, ".gitkeep");
    if (!existsSync(keep)) writeFileSync(keep, "");
    console.log(`  mkdir ${f}/`);
  }

  const claudeMd = renderTemplate(templatePath, {
    VAULT_NAME: vaultName,
    ...buildBlogBlocks(blogSymlink),
  });
  writeIfAbsent(join(vaultDir, "CLAUDE.md"), claudeMd, force);

  writeIfAbsent(
    join(vaultDir, "log.md"),
    `# Log\n\n- [${todayISO()}] create | vault initialized\n`,
    force,
  );

  writeIfAbsent(
    join(vaultDir, "index.md"),
    `# Wiki Index\n\n<!-- Categories emerge organically as wiki pages are created. -->\n`,
    force,
  );

  if (blogSymlink && blogPath) {
    const resolvedBlogPath = resolve(expandHome(blogPath));
    const linkPath = join(vaultDir, blogSymlink);
    if (existsSync(linkPath)) {
      console.log(`  skip  symlink ${blogSymlink} (already exists)`);
    } else if (!existsSync(resolvedBlogPath)) {
      console.log(`  warn  --blog-path ${resolvedBlogPath} does not exist — skipping symlink`);
    } else {
      symlinkSync(resolvedBlogPath, linkPath, "dir");
      console.log(`  link  ${blogSymlink} → ${resolvedBlogPath}`);
    }
  }

  const gitignoreSrc = join(skillRoot, "assets", "gitignore.template");
  if (existsSync(gitignoreSrc)) {
    writeIfAbsent(join(vaultDir, ".gitignore"), readFileSync(gitignoreSrc, "utf8"), force);
  }

  const workflowDir = join(vaultDir, ".github", "workflows");
  mkdirSafe(workflowDir);
  const workflowSrc = join(skillRoot, "assets", "nightly-synthesis.yml.template");
  if (existsSync(workflowSrc)) {
    writeIfAbsent(
      join(workflowDir, "nightly-synthesis.yml"),
      readFileSync(workflowSrc, "utf8"),
      force,
    );
  }

  if (!skipGit) {
    const alreadyRepo = existsSync(join(vaultDir, ".git"));
    try {
      if (!alreadyRepo) {
        execFileSync("git", ["init", "-q", "-b", "main"], { cwd: vaultDir, stdio: "inherit" });
        console.log(`  git   init (branch: main)`);
      }
      execFileSync("git", ["add", "-A"], { cwd: vaultDir, stdio: "inherit" });
      const status = execFileSync("git", ["status", "--porcelain"], { cwd: vaultDir })
        .toString()
        .trim();
      if (status) {
        const message = alreadyRepo ? "scaffold autowiki" : "initial commit: scaffold autowiki";
        execFileSync("git", ["commit", "-q", "-m", message], { cwd: vaultDir, stdio: "inherit" });
        console.log(`  git   commit`);
      } else {
        console.log(`  git   nothing to commit`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  warn  git step failed: ${msg}`);
    }
  }

  console.log(`\ndone. next steps:`);
  console.log(`  1. open ${vaultDir} as a vault in Obsidian`);
  console.log(`  2. install the Obsidian Web Clipper: https://obsidian.md/clipper`);
  console.log(`  3. create a GitHub repo (gh repo create <name> --source=. --private --push)`);
  console.log(`  4. install the Claude GitHub app: https://github.com/apps/claude`);
  console.log(`  5. add ANTHROPIC_API_KEY to repo secrets (gh secret set ANTHROPIC_API_KEY)`);
  console.log(
    `  6. trigger the workflow manually once to verify (gh workflow run nightly-synthesis.yml)`,
  );
}

main();
