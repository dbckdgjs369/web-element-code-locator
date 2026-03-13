import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/babel.ts",
    "src/index.ts",
    "src/client.ts",
    "src/vite.ts",
    "src/esbuild.ts",
    "src/swc.ts",
    "src/webpack.cts",
    "src/babelInjectComponentSource.ts",
    "src/webpackRuntimeEntry.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: "es2022",
});
