import { defineConfig } from "tsup";

const common = {
  format: ["esm", "cjs"] as ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: false,
  target: "es2022" as const,
  minify: true,
};

export default defineConfig([
  // Browser runtime — no Node.js APIs
  {
    ...common,
    entry: ["src/runtime.ts"],
    platform: "browser",
    clean: true,
  },
  // Node.js side (build plugins, middleware)
  // ESM output needs createRequire shim for bundled CJS dependencies
  {
    ...common,
    entry: ["src/index.ts", "src/unplugin.ts", "src/openInEditorPlugin.ts"],
    platform: "node",
    clean: false,
    // unplugin 은 번들한다 — CJS 소비자(webpack 설정 파일)가 require 로 불러야 하는데
    // unplugin 3 은 ESM 전용이라, 외부로 두면 Node 22 미만에서 ERR_REQUIRE_ESM 이 난다.
    // 단 webpack-virtual-modules 는 unplugin 이 createRequire 로 런타임에 부르므로
    // 번들이 불가능하다 → package.json dependencies 로 선언한다.
    noExternal: ["acorn", "acorn-jsx", "acorn-typescript", "estree-walker", "unplugin", "magic-string"],
    esbuildOptions(options, context) {
      if (context.format === "esm") {
        options.banner = {
          js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
        };
      }
      if (context.format === "cjs") {
        options.banner = {
          js: `var __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
        };
        options.define = { ...options.define, "import.meta.url": "__importMetaUrl", "import.meta.dirname": "__dirname" };
      }
    },
  },
]);
