#!/usr/bin/env node
/**
 * init-vault.js — Scaffold an LLM-maintained Obsidian knowledge vault.
 *
 * Usage:
 *   node init-vault.js <target-directory> --vault-name "<name>" [options]
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
 *   node init-vault.js ~/Desktop/AliceVault \
 *     --vault-name "Alice's Knowledge Vault" \
 *     --blog-symlink alice-blog \
 *     --blog-path ~/code/alice-blog
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function parseArgs(argv) {
  const args = { _: [], flags: {} };
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
      args._.push(a);
    }
  }
  return args;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || process.env.USERPROFILE, p.slice(1));
  }
  return p;
}

function mkdirSafe(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeIfAbsent(filePath, contents, force) {
  if (fs.existsSync(filePath) && !force) {
    console.log(`  skip  ${path.relative(process.cwd(), filePath)} (exists)`);
    return false;
  }
  fs.writeFileSync(filePath, contents);
  console.log(`  write ${path.relative(process.cwd(), filePath)}`);
  return true;
}

function renderTemplate(templatePath, substitutions) {
  let tpl = fs.readFileSync(templatePath, "utf8");
  for (const [key, val] of Object.entries(substitutions)) {
    tpl = tpl.replaceAll(`{{${key}}}`, val);
  }
  return tpl;
}

function buildBlogBlocks(blogFolder) {
  if (!blogFolder) {
    return {
      BLOG_ROW: "",
      BLOG_INTERACTIVE_LINE: "",
      BLOG_RULE_LINE: "",
    };
  }
  return {
    BLOG_ROW: `\n| \`${blogFolder}/\` | Symlink to blog repo. Claude can draft/edit posts when asked. | Human: full control. System: read, write (only when explicitly requested). |`,
    BLOG_INTERACTIVE_LINE: `\n- The user can draw from the full vault when writing blog posts.\n- You may draft or edit posts in \`${blogFolder}/\` when explicitly asked. Default to \`status: "draft"\` in frontmatter so the user can review before publishing.`,
    BLOG_RULE_LINE: `\n- The nightly cron job must never write to \`${blogFolder}/\`. Interactive sessions may write there only when the user explicitly asks.`,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const args = parseArgs(process.argv);
  const target = args._[0];
  if (!target) die("missing target directory. usage: init-vault.js <dir> --vault-name \"<name>\"");

  const vaultName = args.flags["vault-name"];
  if (!vaultName || vaultName === true) die("--vault-name is required");

  const blogSymlink = args.flags["blog-symlink"] === true ? null : args.flags["blog-symlink"] || null;
  const blogPath = args.flags["blog-path"] === true ? null : args.flags["blog-path"] || null;
  const force = !!args.flags.force;

  const vaultDir = path.resolve(expandHome(target));
  const skillRoot = path.resolve(__dirname, "..");
  const templatePath = path.join(skillRoot, "assets", "CLAUDE.md.template");

  if (!fs.existsSync(templatePath)) {
    die(`template not found at ${templatePath}`);
  }

  console.log(`\nscaffolding knowledge vault`);
  console.log(`  target:     ${vaultDir}`);
  console.log(`  name:       ${vaultName}`);
  if (blogSymlink) console.log(`  blog:       ${blogSymlink}${blogPath ? ` → ${blogPath}` : " (symlink not created — no --blog-path)"}`);
  console.log();

  mkdirSafe(vaultDir);

  const folders = [
    "Raw",
    "Raw/articles",
    "Raw/files",
    "Notes",
    "Wiki",
    "Daily",
    "Templates",
  ];
  for (const f of folders) {
    const p = path.join(vaultDir, f);
    mkdirSafe(p);
    // Add a .gitkeep so empty folders survive if the user decides to git-init later.
    const keep = path.join(p, ".gitkeep");
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, "");
    console.log(`  mkdir ${f}/`);
  }

  const claudeMd = renderTemplate(templatePath, {
    VAULT_NAME: vaultName,
    ...buildBlogBlocks(blogSymlink),
  });
  writeIfAbsent(path.join(vaultDir, "CLAUDE.md"), claudeMd, force);

  writeIfAbsent(
    path.join(vaultDir, "log.md"),
    `# Log\n\n- [${todayISO()}] create | vault initialized\n`,
    force,
  );

  writeIfAbsent(
    path.join(vaultDir, "index.md"),
    `# Wiki Index\n\n<!-- Categories emerge organically as wiki pages are created. -->\n`,
    force,
  );

  if (blogSymlink && blogPath) {
    const resolvedBlogPath = path.resolve(expandHome(blogPath));
    const linkPath = path.join(vaultDir, blogSymlink);
    if (fs.existsSync(linkPath)) {
      console.log(`  skip  symlink ${blogSymlink} (already exists)`);
    } else if (!fs.existsSync(resolvedBlogPath)) {
      console.log(`  warn  --blog-path ${resolvedBlogPath} does not exist — skipping symlink`);
    } else {
      fs.symlinkSync(resolvedBlogPath, linkPath, "dir");
      console.log(`  link  ${blogSymlink} → ${resolvedBlogPath}`);
    }
  }

  const gitignoreSrc = path.join(skillRoot, "assets", "gitignore.template");
  if (fs.existsSync(gitignoreSrc)) {
    writeIfAbsent(path.join(vaultDir, ".gitignore"), fs.readFileSync(gitignoreSrc, "utf8"), force);
  }

  const workflowDir = path.join(vaultDir, ".github", "workflows");
  mkdirSafe(workflowDir);
  const workflowSrc = path.join(skillRoot, "assets", "nightly-synthesis.yml.template");
  if (fs.existsSync(workflowSrc)) {
    writeIfAbsent(path.join(workflowDir, "nightly-synthesis.yml"), fs.readFileSync(workflowSrc, "utf8"), force);
  }

  if (!args.flags["no-git"]) {
    const alreadyRepo = fs.existsSync(path.join(vaultDir, ".git"));
    try {
      if (!alreadyRepo) {
        execFileSync("git", ["init", "-q", "-b", "main"], { cwd: vaultDir, stdio: "inherit" });
        console.log(`  git   init (branch: main)`);
      }
      execFileSync("git", ["add", "-A"], { cwd: vaultDir, stdio: "inherit" });
      const status = execFileSync("git", ["status", "--porcelain"], { cwd: vaultDir }).toString().trim();
      if (status) {
        execFileSync("git", ["commit", "-q", "-m", alreadyRepo ? "scaffold knowledge vault" : "initial commit: scaffold knowledge vault"], { cwd: vaultDir, stdio: "inherit" });
        console.log(`  git   commit`);
      } else {
        console.log(`  git   nothing to commit`);
      }
    } catch (e) {
      console.log(`  warn  git step failed: ${e.message}`);
    }
  }

  console.log(`\ndone. next steps:`);
  console.log(`  1. open ${vaultDir} as a vault in Obsidian`);
  console.log(`  2. install the Obsidian Web Clipper: https://obsidian.md/clipper`);
  console.log(`  3. create a GitHub repo (gh repo create <name> --source=. --private --push)`);
  console.log(`  4. install the Claude GitHub app: https://github.com/apps/claude`);
  console.log(`  5. add ANTHROPIC_API_KEY to repo secrets (gh secret set ANTHROPIC_API_KEY)`);
  console.log(`  6. trigger the workflow manually once to verify (gh workflow run nightly-synthesis.yml)`);
}

main();
