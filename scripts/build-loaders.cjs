/**
 * webpack / rspack 어댑터용 로더 파일 생성.
 *
 * 배경
 * ----
 * unplugin 의 webpack·rspack 어댑터는 로더를 *파일 경로*로 지정한다.
 * 우리는 unplugin 을 번들에 포함(noExternal)하므로, 번들된 코드가 계산하는
 * 경로는 unplugin 패키지가 아니라 우리 dist 를 가리킨다.
 * 따라서 그 자리에 실제 로더 파일을 우리가 만들어 둬야 한다.
 *
 * 두 가지를 만족해야 한다
 *  1) 자기완결(self-contained) — unplugin 내부 공유 청크(parse-*.mjs 등)를
 *     상대경로로 import 하면 우리 dist 에 그 파일이 없어 깨진다. 번들해서 인라인한다.
 *  2) CommonJS — webpack 의 loader-runner 는 로더를 require 로 불러온다.
 *     .mjs 를 그대로 두면 Node 22 미만에서 ERR_REQUIRE_ESM 이 난다.
 */
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TARGETS = ["webpack", "rspack"];
const LOADERS = ["transform", "load"];

function loaderSource(target, name) {
  const p = path.join(ROOT, "node_modules", "unplugin", "dist", target, "loaders", `${name}.mjs`);
  if (!fs.existsSync(p)) {
    throw new Error(`unplugin 로더 원본을 찾을 수 없습니다: ${p}`);
  }
  return p;
}

let built = 0;
for (const target of TARGETS) {
  for (const name of LOADERS) {
    const outfile = path.join(DIST, target, "loaders", `${name}.cjs`);
    esbuild.buildSync({
      entryPoints: [loaderSource(target, name)],
      outfile,
      bundle: true, // 공유 청크를 인라인 — 별도 파일 의존 제거
      platform: "node",
      format: "cjs",
      target: "node16",
      logLevel: "error",
      // ESM 원본이 import.meta.url 로 createRequire 를 만든다.
      // CJS 로 바꾸면 그 값이 undefined 가 되므로 __filename 으로 채운다.
      define: { "import.meta.url": "__rclImportMetaUrl" },
      banner: {
        js: "const __rclImportMetaUrl = require('url').pathToFileURL(__filename).href;",
      },
    });
    built += 1;
    console.log("loader:", path.relative(ROOT, outfile));
  }
}

// 번들이 참조하는 로더 경로를 .mjs → .cjs 로 바꾼다.
// unplugin 3 은 확장자를 포함한 경로("webpack/loaders/transform.mjs")를 쓴다.
const PATCH_TARGETS = ["index.js", "index.cjs", "unplugin.js", "unplugin.cjs"];
let patched = 0;
for (const file of PATCH_TARGETS) {
  const fp = path.join(DIST, file);
  if (!fs.existsSync(fp)) continue;
  let code = fs.readFileSync(fp, "utf8");
  let hits = 0;
  for (const target of TARGETS) {
    for (const name of LOADERS) {
      const from = `${target}/loaders/${name}.mjs`;
      const to = `${target}/loaders/${name}.cjs`;
      const before = code;
      code = code.split(from).join(to);
      if (code !== before) hits += 1;
    }
  }
  if (hits > 0) {
    fs.writeFileSync(fp, code);
    patched += 1;
    console.log("patched:", file, `(${hits}건)`);
  }
}

// 조용히 실패하면 런타임에야 드러난다. 여기서 끊는다.
if (built !== TARGETS.length * LOADERS.length) {
  throw new Error(`로더 생성 개수가 맞지 않습니다: ${built}`);
}
if (patched === 0) {
  throw new Error(
    "로더 경로 패치가 한 건도 적용되지 않았습니다. " +
      "unplugin 이 참조하는 경로 형식이 바뀐 것일 수 있습니다(dist/index.cjs 에서 loaders 경로를 확인하세요)."
  );
}
