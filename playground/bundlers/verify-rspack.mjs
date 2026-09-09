import { createRequire } from "node:module";
import { checkBundle } from "./verify-common.mjs";

const require = createRequire(import.meta.url);
const { rspack } = require("@rspack/core");
// Deliberately the *webpack* entry point: rspack implements the same plugin surface, and
// proving that here is what lets the README claim one plugin covers both.
const { ReactCodeLocatorPlugin } = require("react-code-locator/webpack");

const root = import.meta.dirname;

const compiler = rspack({
  context: root,
  mode: "development",
  devtool: false,
  target: "node",
  entry: `${root}/src/app.jsx`,
  externals: { react: "commonjs react" },
  output: {
    path: `${root}/out`,
    filename: "rspack.cjs",
    library: { type: "commonjs2" },
  },
  module: {
    rules: [
      {
        test: /\.jsx$/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: { syntax: "ecmascript", jsx: true },
            transform: { react: { runtime: "automatic", development: true } },
          },
        },
      },
    ],
  },
  plugins: [new ReactCodeLocatorPlugin({ projectRoot: root })],
});

await new Promise((resolve, reject) => {
  compiler.run((err, stats) => {
    if (err) return reject(err);
    if (stats.hasErrors()) return reject(new Error(stats.toString({ errorDetails: true })));
    compiler.close(() => resolve());
  });
});

checkBundle("rspack", `${root}/out/rspack.cjs`);
