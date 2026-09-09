import { createRequire } from "node:module";
import { checkBundle } from "./verify-common.mjs";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { esbuildPlugin } = require("react-code-locator/esbuild");

const root = import.meta.dirname;

await build({
  entryPoints: [`${root}/src/app.jsx`],
  bundle: true,
  outfile: `${root}/out/esbuild.cjs`,
  format: "cjs",
  platform: "node",
  jsx: "automatic",
  jsxDev: true,
  external: ["react"],
  plugins: [esbuildPlugin({ projectRoot: root })],
  logLevel: "warning",
});

checkBundle("esbuild", `${root}/out/esbuild.cjs`);
