import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    runtime: "src/runtime.ts",
    wrap: "src/wrap.ts",
    "integrations/next": "src/integrations/next.ts",
    "integrations/webpack": "src/integrations/webpack.ts",
    "integrations/rollup": "src/integrations/rollup.ts",
    "integrations/esbuild": "src/integrations/esbuild.ts",
    "jsx-runtime": "src/jsx-runtime.ts",
    "jsx-dev-runtime": "src/jsx-dev-runtime.ts",
    "babel/plugin": "src/babel/plugin.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // React is the host app's; Vite is the host's build tool. Everything else must be
  // bundled in — this package installs with no transitive dependencies.
  external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "vite"],
});
