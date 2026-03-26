import { defineConfig } from "tsup";

const common = {
  format: ["esm", "cjs"] as ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  target: "es2022" as const,
  minify: true,
};

export default defineConfig([
  // Browser runtime — no Node.js APIs
  {
    ...common,
    entry: ["src/runtime.ts"],
    platform: "browser",
    clean: true,
  },
  // Node.js side (build plugins, middleware)
  // ESM output needs createRequire shim for bundled CJS dependencies (launch-editor-middleware)
  {
    ...common,
    entry: ["src/index.ts", "src/unplugin.ts", "src/openInEditorPlugin.ts"],
    platform: "node",
    clean: false,
    noExternal: ["acorn", "acorn-jsx", "acorn-typescript", "estree-walker", "unplugin", "launch-editor-middleware", "launch-editor"],
    esbuildOptions(options, context) {
      if (context.format === "esm") {
        options.banner = {
          js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
        };
      }
    },
  },
]);
