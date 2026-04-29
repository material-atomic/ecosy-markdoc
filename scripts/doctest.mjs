#!/usr/bin/env node
/**
 * doctest.mjs — drift guard for agent-facing examples.
 *
 * Collects every example file under `agents/v*\/skills/<skill>/examples/` and
 * type-checks it against the current package source. Forward doctest catches
 * stale `correct-*` examples (they stop compiling when the API changes);
 * reverse doctest catches stale `wrong-*` examples via `@ts-expect-error`
 * (directives become unused when a regression makes the wrong code compile).
 *
 * This is the **reference implementation** for the cross-package doctest
 * convention drafted in `<monorepo-root>/resources/ideas.md`. Other ecosy
 * packages can copy this file and adjust the config block at the top.
 *
 * Usage:
 *   node scripts/doctest.mjs              # runs checks, exits non-zero on failure
 *   node scripts/doctest.mjs --json       # JSON report on stdout
 *   node scripts/doctest.mjs --silent     # suppress per-file output, keep summary
 *
 * @ecosy-doctest-version: 0
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

// ─── Config ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

/**
 * Doctest configuration. When a shared reader tool lands this block becomes
 * a separate `doctest.config.ts` — the shape already matches the proposed
 * `defineDoctest({...})` contract in resources/ideas.md.
 */
const CONFIG = {
  /** Glob patterns, resolved relative to the package root. */
  sources: ["agents/v*/skills/**/examples/correct-*.ts", "agents/v*/skills/**/examples/wrong-*.ts"],
  /** Base tsconfig to extend. Relative to the package root. */
  tsconfig: "./tsconfig.json",
  /**
   * Self-link — the package's own name resolves to its source directory.
   * Lets example files import from `@ecosy/markdoc` the way real consumers do.
   */
  selfLink: {
    name: "@ecosy/markdoc",
    srcEntry: "./src/index.ts",
    subpaths: {
      "@ecosy/markdoc/plugins": "./src/plugins/index.ts",
      "@ecosy/markdoc/imports": "./src/imports/index.ts",
      "@ecosy/markdoc/nodejs": "./src/nodejs.ts",
    },
  },
  /** Working directory for transient artefacts. */
  workDir: ".doctest-cache",
};

// ─── CLI args ─────────────────────────────────────────────────────────

const argv = new Set(process.argv.slice(2));
const emitJson = argv.has("--json");
const silent = argv.has("--silent");

// ─── Helpers ──────────────────────────────────────────────────────────

const color = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

/** Per-file output — silenced by --silent and --json. */
function trace(...args) {
  if (!silent && !emitJson) console.log(...args);
}

/** Summary output — silenced only by --json. */
function say(...args) {
  if (!emitJson) console.log(...args);
}

function die(msg, code = 1) {
  console.error(`${color.red}doctest: ${msg}${color.reset}`);
  process.exit(code);
}

// ─── Collect example files ────────────────────────────────────────────

process.chdir(PKG_ROOT);

const files = CONFIG.sources.flatMap((pattern) => globSync(pattern, { nodir: true }));
files.sort();

if (files.length === 0) {
  die(`no example files matched patterns: ${CONFIG.sources.join(", ")}`);
}

// ─── Write a transient tsconfig that includes the examples ───────────

const workDir = resolve(PKG_ROOT, CONFIG.workDir);
if (existsSync(workDir)) rmSync(workDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const tsconfigPath = resolve(workDir, "tsconfig.doctest.json");

// Self-link via `paths` — maps the package's public name to its source.
// This lets example files use `import ... from "@ecosy/markdoc"` exactly as
// downstream consumers do, while the type-checker resolves to the current src.
const pathsMap = {
  [CONFIG.selfLink.name]: [relative(workDir, resolve(PKG_ROOT, CONFIG.selfLink.srcEntry))],
};
for (const [subpath, target] of Object.entries(CONFIG.selfLink.subpaths ?? {})) {
  pathsMap[subpath] = [relative(workDir, resolve(PKG_ROOT, target))];
}

const tsconfig = {
  extends: relative(workDir, resolve(PKG_ROOT, CONFIG.tsconfig)),
  compilerOptions: {
    noEmit: true,
    // Relax a few strictnesses that make sense in examples but not in src.
    // Examples routinely import things by name that consumers resolve via
    // the package entry — `baseUrl + paths` handles that.
    baseUrl: workDir,
    paths: pathsMap,
    // Examples often have module-level await etc. — keep them permissive.
    skipLibCheck: true,
  },
  include: files.map((f) => relative(workDir, resolve(PKG_ROOT, f))),
  // Don't pull the regular `src/**` into this compilation — we only type-check
  // the examples. They reach into src via the `paths` self-link above.
  exclude: ["node_modules", "dist", "src/**/*.ts"],
};

writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), "utf8");

// ─── Run tsc ──────────────────────────────────────────────────────────

const tscBin = resolve(PKG_ROOT, "node_modules/.bin/tsc");
if (!existsSync(tscBin)) {
  die(`tsc not found at ${tscBin} — run \`yarn install\` first.`);
}

trace(`${color.cyan}doctest${color.reset} ${color.dim}${files.length} files${color.reset}`);

const result = spawnSync(tscBin, ["--project", tsconfigPath, "--pretty", "false"], {
  cwd: PKG_ROOT,
  encoding: "utf8",
});

// ─── Parse diagnostics ────────────────────────────────────────────────

/**
 * tsc non-pretty diagnostic format:
 *   <file>(<line>,<col>): error TS<code>: <message>
 */
const diagRegex = /^(.+?)\((\d+),(\d+)\): (error|warning) TS(\d+): (.+)$/;

const stdout = (result.stdout ?? "") + (result.stderr ?? "");
const diagnostics = [];

for (const line of stdout.split("\n")) {
  const m = line.match(diagRegex);
  if (!m) continue;
  const [, filePath, lineNo, colNo, level, code, message] = m;
  const normalized = relative(PKG_ROOT, resolve(PKG_ROOT, filePath));
  diagnostics.push({
    file: normalized,
    line: Number(lineNo),
    column: Number(colNo),
    level,
    code: `TS${code}`,
    message: message.trim(),
  });
}

// ─── Build per-file report ────────────────────────────────────────────

const report = files.map((f) => {
  const fileDiagnostics = diagnostics.filter((d) => d.file === f);
  return {
    file: f,
    passed: fileDiagnostics.length === 0,
    diagnostics: fileDiagnostics,
  };
});

const passed = report.filter((r) => r.passed).length;
const failed = report.length - passed;

// ─── Render output ────────────────────────────────────────────────────

if (emitJson) {
  process.stdout.write(
    JSON.stringify(
      {
        summary: { total: report.length, passed, failed },
        report,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  for (const entry of report) {
    if (entry.passed) {
      trace(`  ${color.green}✓${color.reset} ${color.dim}${entry.file}${color.reset}`);
    } else {
      // Failures always surface — even under --silent — so the developer
      // knows which file is broken without re-running at a higher verbosity.
      say(`  ${color.red}✗${color.reset} ${entry.file}`);
      for (const d of entry.diagnostics) {
        say(`      ${color.red}${d.code}${color.reset} at ${d.line}:${d.column}: ${d.message}`);
      }
    }
  }

  const tag = failed === 0 ? `${color.green}PASS${color.reset}` : `${color.red}FAIL${color.reset}`;
  say(
    `  ${tag}  ${report.length} file${report.length === 1 ? "" : "s"} · passed ${passed} · failed ${failed}`,
  );
}

// ─── Cleanup + exit ───────────────────────────────────────────────────

// Keep the tsconfig on failure so developers can rerun tsc manually and
// introspect; scrub it on success.
if (failed === 0) {
  rmSync(workDir, { recursive: true, force: true });
} else {
  say(`  ${color.dim}kept working config:${color.reset} ${relative(PKG_ROOT, tsconfigPath)}`);
}

process.exit(failed === 0 ? 0 : 1);
