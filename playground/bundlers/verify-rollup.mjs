import { createRequire } from "node:module";
import { checkBundle } from "./verify-common.mjs";

const require = createRequire(import.meta.url);
const { rollup } = require("rollup");
const { babel } = require("@rollup/plugin-babel");
const { nodeResolve } = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const { rollupPlugin } = require("react-code-locator/rollup");

const root = import.meta.dirname;

const bundle = await rollup({
  input: `${root}/src/app.jsx`,
  external: (id) => id === "react",
  onwarn(warning, warn) {
    // react's CJS internals trip these; neither says anything about our plugin.
    if (warning.code === "CIRCULAR_DEPENDENCY" || warning.code === "THIS_IS_UNDEFINED") return;
    warn(warning);
  },
  plugins: [
    rollupPlugin({ projectRoot: root }),
    nodeResolve({ extensions: [".js", ".jsx", ".cjs"] }),
    commonjs(),
    babel({
      babelHelpers: "bundled",
      extensions: [".jsx"],
      presets: [["@babel/preset-react", { runtime: "automatic", development: true }]],
    }),
  ],
});

await bundle.write({ file: `${root}/out/rollup.cjs`, format: "cjs", exports: "named" });
await bundle.close();

checkBundle("rollup", `${root}/out/rollup.cjs`);
