import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/client.ts",
    "src/vite.ts",
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
  // Bundle acorn and astring so users don't need to install them
  noExternal: ["acorn", "astring"],
});
