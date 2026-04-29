#!/usr/bin/env node
/**
 * markdoc-manifest — scan a Markdoc content tree and propose
 * `_manifest.md` children lists from the filesystem.
 *
 * Shipped as the `markdoc-manifest` bin of `@ecosy/markdoc`. Consumers
 * run it via the package manager without copying source into their tree:
 *
 *   yarn markdoc-manifest             # dry-run diff, exit 1 on drift
 *   yarn markdoc-manifest --write     # apply changes
 *   yarn markdoc-manifest --init      # create missing manifests
 *   yarn markdoc-manifest --root docs/content
 *
 * Or invoke directly:
 *
 *   node node_modules/@ecosy/markdoc/bin/markdoc-manifest.mjs [flags]
 *
 * Philosophy
 * ----------
 * Hand-maintained manifests drift the moment someone adds a new page and
 * forgets to register it. This tool walks the content directory, figures
 * out what each `_manifest.md` *should* list, and either prints a diff or
 * rewrites the manifests in place — preserving any frontmatter fields the
 * developer authored (title, description, custom keys). Only the
 * `children:` block is regenerated.
 *
 * A non-zero exit code in the default (dry-run) mode means "filesystem
 * and manifests disagree" — convenient as a CI guard.
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Config ──────────────────────────────────────────────────────────

// Default is `./content` — the common layout (`<repo-root>/content/*.md`).
// Projects using a different path should pass `--root <path>`.
const DEFAULT_CONTENT_ROOT = "content";

/**
 * Directories skipped entirely. `_components/` holds HTML component
 * templates (not pages); developers hand-maintain its manifest if at
 * all. Skip any other directory name here for similar reasons.
 */
const SKIP_DIRS = new Set(["_components"]);

/**
 * Files skipped when enumerating children of a directory. These are
 * infrastructure files, not routable pages.
 */
const SKIP_FILES = new Set(["_manifest.md", "_template.md", "_metadata.md"]);

// ─── CLI args ────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const mode = argv.includes("--write") ? "write" : argv.includes("--init") ? "init" : "dry";

const rootArgIdx = argv.indexOf("--root");
const CONTENT_ROOT = resolve(
  rootArgIdx >= 0 && argv[rootArgIdx + 1] ? argv[rootArgIdx + 1] : DEFAULT_CONTENT_ROOT,
);

if (!existsSync(CONTENT_ROOT)) {
  console.error(`[markdoc-manifest] content root not found: ${CONTENT_ROOT}`);
  console.error(`                   pass --root <dir> to override`);
  process.exit(2);
}

// ─── Colors ──────────────────────────────────────────────────────────

const color = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

// ─── Walk the tree, build proposals ──────────────────────────────────

/**
 * @typedef {{
 *   dir: string;          // absolute path
 *   relDir: string;       // relative to content root
 *   proposed: string[];   // children list this script computed
 *   existing: string[] | null;  // children list parsed from existing _manifest.md (null = file missing)
 *   raw: string | null;   // existing _manifest.md full contents (null = missing)
 * }} DirReport
 */

/**
 * @param {string} dir absolute directory path
 * @returns {Promise<DirReport[]>}
 */
async function walk(dir) {
  const reports = [];
  await walkInto(dir, reports);
  return reports;
}

async function walkInto(dir, reports) {
  const entries = await readdir(dir, { withFileTypes: true });

  const mdFiles = [];
  const subdirs = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      subdirs.push(entry.name);
    } else if (entry.isFile()) {
      if (!entry.name.endsWith(".md")) continue;
      if (SKIP_FILES.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      mdFiles.push(entry.name);
    }
  }

  // Sub-manifest references — any subdir that itself has content
  // (recursively) earns a `<subdir>/_manifest` entry in this dir's children.
  const subManifestRefs = [];
  for (const sub of subdirs) {
    const subPath = join(dir, sub);
    const hasContent = await directoryHasContent(subPath);
    if (hasContent) subManifestRefs.push(`${sub}/_manifest`);
  }

  const filesystemChildren = [
    ...mdFiles.map((f) => f.replace(/\.md$/, "")),
    ...subManifestRefs,
  ];

  const manifestPath = join(dir, "_manifest.md");
  let existing = null;
  let raw = null;
  if (existsSync(manifestPath)) {
    raw = await readFile(manifestPath, "utf8");
    existing = parseChildren(raw);
  }

  // Preserve author-authored ordering when possible. Strategy:
  //   - Start with the existing children list (authoritative for order).
  //   - Drop entries no longer on disk.
  //   - Append entries new on disk to the tail (lexicographic among themselves).
  // This keeps a manually-curated progression intact across rebuilds;
  // only additions/removals ever alter the list.
  const proposed = mergeChildren(existing, filesystemChildren);

  // Only emit a report if this directory should have a manifest.
  // Rule: any directory with at least one .md page (ignoring infra files)
  // OR at least one sub-manifest dir deserves a manifest.
  if (proposed.length > 0 || raw != null) {
    reports.push({
      dir,
      relDir: relative(CONTENT_ROOT, dir) || ".",
      proposed,
      existing,
      raw,
    });
  }

  for (const sub of subdirs) {
    await walkInto(join(dir, sub), reports);
  }
}

async function directoryHasContent(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md") && !SKIP_FILES.has(entry.name)) {
        return true;
      }
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        const deeper = await directoryHasContent(join(dir, entry.name));
        if (deeper) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

// ─── Frontmatter helpers ─────────────────────────────────────────────

/**
 * Parse the `children:` list from an existing `_manifest.md`. Recognises:
 *
 *   children: []
 *   children:
 *     - foo
 *     - bar
 *
 * Returns null if no `children:` key found.
 *
 * Line-based walk instead of a single regex — JS lacks `\Z`, and
 * line-based logic is easier to reason about when the list is followed
 * by another top-level key or by the closing `---`.
 */
function parseChildren(raw) {
  const fm = extractFrontmatter(raw);
  if (fm == null) return null;

  const lines = fm.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inline form: `children: []`
    const inline = line.match(/^children:\s*\[\s*\]\s*$/);
    if (inline) return [];

    // Block form: `children:` on its own line, followed by `  - item` lines.
    if (/^children:\s*$/.test(line)) {
      const items = [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        const item = next.match(/^\s*-\s*(.+?)\s*$/);
        if (item) {
          items.push(stripQuotes(item[1]));
          continue;
        }
        // Stop at the next top-level key or blank line.
        if (next.trim() === "" || /^[A-Za-z_][\w-]*:/.test(next)) break;
      }
      return items;
    }
  }

  return null;
}

/**
 * Merge an author-ordered `existing` children list with the filesystem
 * truth. Preserves the relative order the author wrote, drops entries no
 * longer on disk, appends new-on-disk entries (sorted among themselves
 * for determinism) at the tail.
 */
function mergeChildren(existing, filesystem) {
  if (!existing) return [...filesystem].sort();
  const fsSet = new Set(filesystem);
  const kept = existing.filter((c) => fsSet.has(c));
  const existingSet = new Set(existing);
  const added = filesystem.filter((c) => !existingSet.has(c)).sort();
  return [...kept, ...added];
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function extractFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  return match ? match[1] : null;
}

/**
 * Build a new `_manifest.md` — preserve existing frontmatter fields
 * except `children` (which is fully regenerated), and preserve the body
 * after frontmatter.
 */
function buildManifest(raw, children) {
  const childrenBlock = serializeChildren(children);

  if (raw == null) {
    // No existing manifest — emit a minimal skeleton.
    return `---\n${childrenBlock}---\n`;
  }

  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(\n[\s\S]*)?$/);
  if (!fmMatch) {
    // Malformed existing manifest — prepend new frontmatter, keep body.
    return `---\n${childrenBlock}---\n\n${raw}`;
  }

  const existingFm = fmMatch[1];
  const body = fmMatch[2] ?? "";

  // Strip existing `children:` block (inline `[]` or `-`-list form).
  let fmWithoutChildren = existingFm.replace(/^children:\s*\[\s*\]\s*\n?/m, "");
  fmWithoutChildren = fmWithoutChildren.replace(/^children:\s*\n(?:[ \t]*-\s*.+\n?)*/m, "");

  // Ensure exactly one trailing newline before the children block.
  const preserved = fmWithoutChildren.replace(/\n+$/, "");
  const joined = preserved.length > 0 ? `${preserved}\n${childrenBlock}` : childrenBlock;

  return `---\n${joined}---${body || "\n"}`;
}

function serializeChildren(children) {
  if (children.length === 0) return "children: []\n";
  const lines = children.map((c) => `  - ${c}`).join("\n");
  return `children:\n${lines}\n`;
}

// ─── Diff + rendering ────────────────────────────────────────────────

function diff(existing, proposed) {
  const existingSet = new Set(existing ?? []);
  const proposedSet = new Set(proposed);
  const added = proposed.filter((x) => !existingSet.has(x));
  const removed = (existing ?? []).filter((x) => !proposedSet.has(x));
  return { added, removed };
}

function renderReport(report) {
  const { relDir, proposed, existing, raw } = report;
  const header = `${color.cyan}${relDir}${color.reset}${raw == null ? ` ${color.yellow}(new)${color.reset}` : ""}`;

  if (raw == null) {
    // Missing manifest — always a diff in --init mode.
    return [header, ...proposed.map((c) => `    ${color.green}+ ${c}${color.reset}`)].join("\n");
  }

  const { added, removed } = diff(existing, proposed);
  if (added.length === 0 && removed.length === 0) {
    return `${header} ${color.dim}✓ in sync${color.reset}`;
  }

  return [
    header,
    ...added.map((c) => `    ${color.green}+ ${c}${color.reset}`),
    ...removed.map((c) => `    ${color.red}- ${c}${color.reset}`),
  ].join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────

console.log(
  `${color.cyan}markdoc-manifest${color.reset} ${color.dim}mode=${mode} root=${relative(process.cwd(), CONTENT_ROOT) || "."}${color.reset}`,
);

const reports = await walk(CONTENT_ROOT);
reports.sort((a, b) => a.relDir.localeCompare(b.relDir));

let dirty = 0;
let wrote = 0;
let created = 0;

for (const report of reports) {
  const { added, removed } = diff(report.existing, report.proposed);
  const isDirty = added.length > 0 || removed.length > 0 || report.raw == null;
  if (isDirty) dirty++;

  console.log(renderReport(report));

  if (mode === "write" && isDirty && report.raw != null) {
    const next = buildManifest(report.raw, report.proposed);
    const manifestPath = join(report.dir, "_manifest.md");
    await writeFile(manifestPath, next, "utf8");
    wrote++;
  }

  if (mode === "init" && report.raw == null) {
    const next = buildManifest(null, report.proposed);
    const manifestPath = join(report.dir, "_manifest.md");
    await writeFile(manifestPath, next, "utf8");
    created++;
  }
}

console.log("");
if (mode === "dry") {
  if (dirty === 0) {
    console.log(`${color.green}  ✓ all ${reports.length} manifests in sync${color.reset}`);
    process.exit(0);
  }
  console.log(`${color.red}  ✗ ${dirty} of ${reports.length} manifests out of sync${color.reset}`);
  console.log(`    ${color.dim}run with --write to apply (or --init for missing)${color.reset}`);
  process.exit(1);
}

if (mode === "write") {
  console.log(
    `${color.green}  ✓ rewrote ${wrote} manifest${wrote === 1 ? "" : "s"}${color.reset}${color.dim}  (frontmatter preserved, children regenerated)${color.reset}`,
  );
}

if (mode === "init") {
  console.log(
    `${color.green}  ✓ created ${created} manifest${created === 1 ? "" : "s"}${color.reset}${color.dim}  (use --write to re-sync children on existing manifests)${color.reset}`,
  );
}

// Silence unused imports warning — `dirname`, `fileURLToPath` reserved for
// future "run from repo root regardless of CWD" enhancement.
void dirname;
void fileURLToPath;
void stat;
