import { createRequire } from "node:module";
import { checkBundle } from "./verify-common.mjs";

const require = createRequire(import.meta.url);
const webpack = require("webpack");
const { ReactCodeLocatorPlugin } = require("react-code-locator/webpack");

const root = import.meta.dirname;

const compiler = webpack({
  context: root,
  mode: "development",
  devtool: false,
  target: "node",
  entry: `${root}/src/app.jsx`,
  externals: { react: "commonjs react" },
  output: {
    path: `${root}/out`,
    filename: "webpack.cjs",
    library: { type: "commonjs2" },
  },
  module: {
    rules: [
      {
        test: /\.jsx$/,
        loader: "babel-loader",
        options: {
          presets: [["@babel/preset-react", { runtime: "automatic", development: true }]],
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

checkBundle("webpack", `${root}/out/webpack.cjs`);
