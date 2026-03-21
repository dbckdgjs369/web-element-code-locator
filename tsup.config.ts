import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/client.ts",
    "src/esbuild.ts",
    "src/swc.ts",
    "src/unplugin.ts",
    "src/webpack.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: "es2022",
  minify: true,
  // Bundle acorn and astring so users don't need to install them
  // All bundled — pure JS, no native bindings
  noExternal: ["acorn", "acorn-jsx", "acorn-typescript", "astring", "estree-walker", "unplugin"],
});
