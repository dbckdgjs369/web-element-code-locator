import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/client.ts",
    "src/vite.ts",
    "src/webpack.cts",
    "src/babelInjectComponentSource.ts",
    "src/webpackRuntimeEntry.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
});
