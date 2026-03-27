const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "../dist");
const files = ["index.js", "index.cjs", "unplugin.js", "unplugin.cjs"];
const patterns = [
  ["webpack/loaders/transform", "webpack/loaders/transform.cjs"],
  ["webpack/loaders/load", "webpack/loaders/load.cjs"],
  ["rspack/loaders/transform", "rspack/loaders/transform.cjs"],
  ["rspack/loaders/load", "rspack/loaders/load.cjs"],
];

for (const file of files) {
  const filepath = path.join(distDir, file);
  if (!fs.existsSync(filepath)) continue;

  let content = fs.readFileSync(filepath, "utf8");
  for (const [from, to] of patterns) {
    content = content.replaceAll(JSON.stringify(from), JSON.stringify(to));
  }
  fs.writeFileSync(filepath, content);
  console.log("patched:", file);
}
