import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import path from "path";
import { glob } from "glob";

// Collect all source entries, excluding test/spec files.
const inputFiles = glob.sync("src/**/*.{ts,tsx}", {
  ignore: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}", "**/vitest.setup.ts"],
});

const input = inputFiles.reduce((acc, file) => {
  const relativePath = path.relative("src", file);
  const key = relativePath.replace(path.extname(relativePath), "");
  acc[key] = file;
  return acc;
}, {});

// Keep runtime dependencies external so consumers resolve them from their own
// node_modules. Any `@ecosy/*` sub-path, `front-matter`, or `node:*` builtin
// is treated as external — a predicate is simpler and more forgiving than an
// exhaustive list as new sub-exports are added upstream.
const external = (id) =>
  id.startsWith("@ecosy/") || id === "front-matter" || id.startsWith("node:");

const minifyOptions = {
  compress: {
    drop_console: true,
    drop_debugger: true,
    pure_funcs: ["console.log", "console.info", "console.debug"],
  },
  mangle: true,
};

const cjsConfig = {
  input,
  external,
  output: {
    dir: "dist",
    format: "cjs",
    entryFileNames: "[name].js",
    chunkFileNames: "[name].js",
    exports: "named",
    preserveModules: true,
    preserveModulesRoot: "src",
    interop: "auto",
  },
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "dist",
      rootDir: "src",
    }),
    terser(minifyOptions),
  ],
};

const esmConfig = {
  input,
  external,
  output: {
    dir: "dist",
    format: "esm",
    entryFileNames: "[name].mjs",
    exports: "named",
    preserveModules: true,
    preserveModulesRoot: "src",
    interop: "auto",
    generatedCode: {
      symbols: true,
    },
  },
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: false,
      declarationDir: undefined,
      rootDir: "src",
    }),
    terser(minifyOptions),
  ],
};

export default [cjsConfig, esmConfig];
