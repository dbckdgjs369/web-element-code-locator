/**
 * webpack / rspack 어댑터가 런타임에 파일 경로·require 로 찾는 것들을 dist 안에 만들어 둔다.
 *
 * (1) 로더 파일
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
 *
 * (2) webpack-virtual-modules
 * unplugin 의 webpack 어댑터는 이 패키지를 *동적* require 로 부른다. 동적이라
 * 번들러가 정적으로 끌어오지 못해, 그냥 두면 설치 의존성(dependencies)이 된다.
 * 이 패키지는 "설치하면 이것만 들어온다"를 원칙으로 하므로, 실물을 번들해
 * dist/vendor 에 넣고 require 대상을 그쪽으로 돌린다.
 * (MIT — 라이선스 고지는 vendor 파일 상단에 함께 넣는다.)
 */
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const TARGETS = ["webpack", "rspack"];
const LOADERS = ["transform", "load"];

// unplugin 이 동적 require 하는 모듈 → dist 안에 번들해 둘 위치(dist 루트 기준 상대경로).
// dist/index.{js,cjs} 와 dist/unplugin.{js,cjs} 는 모두 dist 루트에 있으므로
// 네 파일 전부 같은 "./vendor/..." 로 해석된다.
const VENDORED = [
  { request: "webpack-virtual-modules", outname: "webpack-virtual-modules.cjs" },
];

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

// 동적 require 되는 모듈을 dist/vendor 로 번들.
let vendored = 0;
for (const { request, outname } of VENDORED) {
  let entry;
  try {
    entry = require.resolve(request, { paths: [ROOT] });
  } catch {
    throw new Error(`번들할 모듈을 찾을 수 없습니다: ${request} (devDependencies 에 있는지 확인하세요)`);
  }
  const outfile = path.join(DIST, "vendor", outname);
  esbuild.buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node16",
    logLevel: "error",
    legalComments: "inline", // 번들된 패키지의 라이선스 고지를 보존
    banner: { js: `// Bundled: ${request} (MIT). See node_modules/${request}/LICENSE` },
  });
  vendored += 1;
  console.log("vendor:", path.relative(ROOT, outfile));
}

// 번들이 런타임에 찾는 것들을 dist 내부를 가리키도록 바꾼다.
//  - 로더 경로: .mjs → .cjs (unplugin 3 은 확장자 포함 경로를 쓴다)
//  - 동적 require 대상: 패키지 이름 → dist/vendor 상대경로
const PATCH_TARGETS = ["index.js", "index.cjs", "unplugin.js", "unplugin.cjs"];
let patched = 0;
let vendorPatched = 0;
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
  // require 셰임의 이름은 축약되어 파일마다 다르므로(zo/Yo/mo…), 인자인
  // 모듈 이름 문자열만 바꾼다. 셰임은 createRequire(이 파일) 기반이라
  // "./vendor/..." 가 dist 기준으로 해석된다.
  let vhits = 0;
  for (const { request, outname } of VENDORED) {
    const from = `"${request}"`;
    const to = `"./vendor/${outname}"`;
    const before = code;
    code = code.split(from).join(to);
    if (code !== before) vhits += 1;
  }
  if (hits > 0 || vhits > 0) {
    fs.writeFileSync(fp, code);
    if (hits > 0) patched += 1;
    if (vhits > 0) vendorPatched += 1;
    console.log("patched:", file, `(로더 ${hits}건, vendor ${vhits}건)`);
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
if (vendored !== VENDORED.length) {
  throw new Error(`vendor 번들 개수가 맞지 않습니다: ${vendored}`);
}
if (vendorPatched === 0) {
  throw new Error(
    "vendor require 패치가 한 건도 적용되지 않았습니다. " +
      "unplugin 이 해당 모듈을 더 이상 동적 require 하지 않거나 호출 형태가 바뀐 것일 수 있습니다. " +
      "그대로 배포하면 설치 의존성이 되살아납니다(dist/index.js 에서 확인하세요)."
  );
}
// 패치 후에도 패키지 이름이 남아 있으면 런타임에 그 이름으로 require 를 시도한다.
for (const file of PATCH_TARGETS) {
  const fp = path.join(DIST, file);
  if (!fs.existsSync(fp)) continue;
  const code = fs.readFileSync(fp, "utf8");
  for (const { request } of VENDORED) {
    if (code.includes(`"${request}"`)) {
      throw new Error(`dist/${file} 에 "${request}" 참조가 남아 있습니다.`);
    }
  }
}
