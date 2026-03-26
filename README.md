# React Code Locator

개발 중인 React 앱에서 요소를 우클릭하면 해당 UI와 연결된 소스 위치를 찾는 패키지입니다.

- **Zero dependencies**: Babel, React DevTools, 브라우저 익스텐션 — 아무것도 필요 없습니다. 빌드 플러그인 하나로 끝납니다.
- **React 19 지원**: `fiber._debugSource`는 React 19에서 제거됐습니다. 이 패키지는 빌드 시점에 직접 source metadata를 주입하므로 React 버전에 관계없이 동작합니다.
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
const { webpackPlugin } = require("react-code-locator");

module.exports = {
  webpack(config) {
    config.plugins.push(webpackPlugin());
    return config;
  },
};
```

### Create React App

```js
// config-overrides.js
const { webpackPlugin } = require("react-code-locator");

module.exports = {
  webpack(config) {
    config.plugins.push(webpackPlugin());
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

```ts
// 모든 플러그인 공통 옵션
webpackPlugin({
  // 플러그인 활성화 여부 (기본값: NODE_ENV === "development")
  // NODE_ENV 대신 커스텀 환경변수를 사용하는 경우 직접 지정하세요.
  enabled: process.env.MY_ENV === "dev",

  projectRoot: process.cwd(),    // 프로젝트 루트 — 소스 경로의 상대 경로 기준 (기본값: process.cwd())
});

// Vite 전용 추가 옵션
vitePlugin({
  enabled: process.env.MY_ENV === "dev",
  projectRoot: process.cwd(),

  // injectClient: true (기본값) — enableReactComponentJump()를 자동으로 HTML에 주입합니다.
  // injectClient: false — 자동 주입을 끄고 직접 enableReactComponentJump()를 호출해 제어합니다.
  injectClient: true,

  editor: "code",                // 에디터 커맨드 (기본값: EDITOR 환경변수 → 실행 중인 에디터 자동 감지)

  locator: {                     // 런타임 옵션 (injectClient: true 일 때 자동 주입되는 설정)
    triggerKey: "shift",         // 트리거 키: "alt" | "meta" | "ctrl" | "shift" | "none" (기본값: "shift")
    projectRoot: process.cwd(),  // 소스 경로 정규화 기준 (기본값: 미설정)
    openInEditor: true,          // 우클릭 메뉴에 "Open in editor" 항목 표시 (기본값: false)
    onLocate(result) {},         // 소스 위치 발견 시 콜백
    onError(error) {},           // 오류 발생 시 콜백
  },
});
```

## 사용

### 호버 하이라이트

트리거 키(기본값: `Shift`)를 누른 상태로 요소에 마우스를 올리면 DevTools 인스펙터처럼 해당 요소가 파란색으로 하이라이트되고, 연결된 컴포넌트 파일명과 줄 번호가 표시됩니다.

### 우클릭 컨텍스트 메뉴

트리거 키를 누른 상태에서 요소를 **우클릭**하면 컨텍스트 메뉴가 표시됩니다.

| 항목 | 동작 |
|------|------|
| Open in editor | 에디터에서 해당 소스 파일 열기 (`openInEditor: true` 설정 시 표시) |
| Copy path | 소스 경로를 클립보드에 복사 |

### 단축키

| 키 | 동작 |
|----|------|
| `Shift + Click` | 소스 위치를 콘솔에 출력 |
| `Alt + 1` | screen 모드 (화면에 보이는 컴포넌트, 기본값) |
| `Alt + 2` | implementation 모드 (구현체 위치) |

## 에디터 열기

`openInEditor: true`를 설정하면 우클릭 메뉴에 "Open in editor" 항목이 나타납니다.

### Vite

```ts
// vite.config.ts
vitePlugin({
  editor: "code",   // VS Code CLI 커맨드
  locator: {
    openInEditor: true,
  },
})
```

### Webpack / Rspack

`openInEditorMiddleware`를 devServer에 추가해야 합니다.

```js
// webpack.config.js
const { webpackPlugin, openInEditorMiddleware } = require("react-code-locator");

module.exports = {
  plugins: [webpackPlugin()],
  devServer: {
    setupMiddlewares(middlewares) {
      middlewares.unshift({
        name: "open-in-editor",
        path: "/__open-in-editor",
        middleware: openInEditorMiddleware(),
      });
      return middlewares;
    },
  },
};
```

```ts
// main.tsx
import { enableReactComponentJump } from "react-code-locator";

enableReactComponentJump({ openInEditor: true });
```

열리는 에디터는 `EDITOR` 환경변수로 지정할 수 있습니다. 미설정 시 현재 실행 중인 에디터를 자동 감지합니다.

```bash
EDITOR=code npm run dev   # VS Code
EDITOR=webstorm npm run dev
EDITOR=cursor npm run dev
```

## 수동 설정

`injectClient: false`로 자동 주입을 끄고 직접 `enableReactComponentJump`를 호출해 활성화 여부를 제어할 수 있습니다. Vite가 아닌 환경에서도 이 방식을 사용합니다.

```ts
// vite.config.ts
vitePlugin({ injectClient: false })
```

```ts
// main.tsx
import { enableReactComponentJump } from "react-code-locator";

enableReactComponentJump({
  enabled: true,                   // 기본값: true. false로 설정하면 비활성화
  triggerKey: "shift",             // "alt" | "meta" | "ctrl" | "shift" | "none" (기본값: "shift")
  projectRoot: "/path/to/project", // 소스 경로 정규화 기준 (선택)
  openInEditor: true,              // 우클릭 메뉴에 "Open in editor" 표시
  onLocate(result) {
    console.log("Source:", result.source);  // result.source, result.mode
  },
  onError(error) {
    console.error("Error:", error);
  },
});
```

## 알려진 제한사항

- **React Native 미지원**: DOM API에 의존합니다.
- **Turbopack 미지원**: Next.js 13+의 Turbopack은 현재 지원되지 않습니다.
- **TSX generic arrow function**: `.tsx` 파일에서 `<T,>` 형태의 제네릭 화살표 함수가 있는 파일은 transform이 스킵됩니다. (`function` 선언형이나 `.ts` 파일에서는 정상 동작합니다.)
- **disabled 요소 / pointer-events 차단**: `disabled` 속성이 있는 버튼이나 `pointer-events: none`이 적용된 요소는 클릭 이벤트가 발생하지 않아 감지되지 않습니다.
- **CRA (Create React App)**: webpack 설정이 숨겨져 있어 `react-app-rewired` 또는 `craco` 없이는 플러그인 적용이 불가합니다.
- **개발 전용**: 플러그인의 `enabled` 기본값이 `NODE_ENV === "development"`이므로, 프로덕션 빌드에서는 자동으로 비활성화됩니다.

## License

MIT
