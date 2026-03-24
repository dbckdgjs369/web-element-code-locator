# React Code Locator

개발 중인 React 앱에서 요소를 `Shift + Click`하면 해당 UI와 연결된 소스 위치를 찾는 패키지입니다.

- React element 생성 시 source metadata를 주입하고, 브라우저 런타임에서 Fiber를 따라 위치를 계산합니다.
- **완전 번들링**: acorn 기반 순수 JS 파서를 내장 — 별도 파서 설치 불필요
- **Universal**: Vite, Webpack, Rollup, esbuild, Rspack 모두 지원
- **개발 전용**: 프로덕션 빌드에 영향 없음

## 설치

```bash
npm i -D react-code-locator
```

## 빠른 시작

### Vite

`vitePlugin`은 소스 transform + 클라이언트 런타임 자동 주입을 모두 처리합니다.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vitePlugin } from "react-code-locator";

export default defineConfig({
  plugins: [
    react(),
    vitePlugin(),
  ],
});
```

### Next.js (Webpack)

```js
// next.config.js
const { webpackPlugin } = require("react-code-locator/webpack");

module.exports = {
  webpack(config, { dev }) {
    if (dev) {
      config.plugins.push(webpackPlugin());
    }
    return config;
  },
};
```

### Create React App

```js
// config-overrides.js
const { webpackPlugin } = require("react-code-locator/webpack");

module.exports = {
  webpack(config, env) {
    if (env === "development") {
      config.plugins.push(webpackPlugin());
    }
    return config;
  },
};
```

### Rollup

```js
// rollup.config.js
import { rollupPlugin } from "react-code-locator";

export default {
  plugins: [rollupPlugin()],
};
```

### esbuild

```js
import { esbuildPlugin } from "react-code-locator";

await esbuild.build({
  plugins: [esbuildPlugin()],
});
```

### Rspack

```js
// rspack.config.js
const { rspackPlugin } = require("react-code-locator");

module.exports = {
  plugins: [rspackPlugin()],
};
```

## 옵션

모든 플러그인이 동일한 옵션을 공유합니다.

```ts
vitePlugin({
  // 소스 transform 옵션
  projectRoot: process.cwd(),    // 프로젝트 루트 (상대 경로 기준)
  injectComponentSource: true,   // 컴포넌트 정의에 소스 주입
  injectJsxSource: true,         // JSX 호출부에 소스 주입
  include: /\.[jt]sx$/,          // 포함할 파일 패턴
  exclude: /node_modules/,       // 제외할 파일 패턴

  // Vite 전용 옵션
  injectClient: true,            // 클라이언트 런타임 자동 주입 (기본값: true)
  locator: {                     // 런타임 옵션
    triggerKey: "shift",         // 트리거 키: "alt" | "meta" | "ctrl" | "shift" | "none" (기본값: "shift")
    projectRoot: process.cwd(),  // 소스 경로 정규화 기준 (기본값: 미설정)
    onLocate(result) {},         // 소스 위치 발견 시 콜백
    onError(error) {},           // 오류 발생 시 콜백
  },
});
```

## 사용

개발 서버에서 `Shift + Click`하면 브라우저 콘솔에 소스 위치가 출력됩니다.

```
[react-code-locator] src/components/Button.tsx:14:1
```

결과를 클릭하면 클립보드에 복사됩니다.

### 단축키

| 키 | 동작 |
|----|------|
| `Shift + Click` | 소스 위치 찾기 |
| `Alt + 1` | direct 모드 (JSX 호출부 위치) |
| `Alt + 2` | screen 모드 (화면에 보이는 컴포넌트) |
| `Alt + 3` | implementation 모드 (구현체 위치) |

## 수동 설정 (고급)

Vite가 아닌 환경에서는 클라이언트 런타임을 직접 초기화해야 합니다.

```ts
import { enableReactComponentJump } from "react-code-locator";

const cleanup = enableReactComponentJump({
  triggerKey: "shift",         // "alt" | "meta" | "ctrl" | "shift" | "none" (기본값: "shift")
  projectRoot: process.cwd(),  // 소스 경로 정규화 기준 (선택)
  onLocate(result) {
    console.log("Source:", result.source);  // result.source, result.mode
  },
  onError(error) {
    console.error("Error:", error);
  },
});

// 필요 시 이벤트 리스너 정리
cleanup?.();
```

## 알려진 제한사항

- **React Native 미지원**: DOM API에 의존합니다.
- **Turbopack 미지원**: Next.js 13+의 Turbopack은 현재 지원되지 않습니다.
- **TSX generic arrow function**: `.tsx` 파일에서 `<T,>` 형태의 제네릭 화살표 함수가 있는 파일은 transform이 스킵됩니다. (`function` 선언형이나 `.ts` 파일에서는 정상 동작합니다.)
- **개발 전용**: `NODE_ENV=development` 환경에서만 사용하세요.

## License

MIT
