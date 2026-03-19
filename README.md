# React Code Locator

개발 중인 React 앱에서 요소를 `Shift + Click`하면 해당 UI와 연결된 소스 위치를 찾는 패키지입니다.

- React element 생성 시 source metadata를 붙이고, 브라우저 런타임에서 Fiber를 따라 위치를 계산합니다.
- JSX 디버그 정보가 있으면 우선 사용하고, 없으면 컴포넌트 정의 위치로 fallback 합니다.
- Babel, Vite, esbuild, SWC 파이프라인용 어댑터와 브라우저 런타임을 분리해서 사용할 수 있습니다.

## 설치

```bash
npm i -D react-code-locator
```

로컬 패키지로 연결할 때는:

```bash
npm i -D /absolute/path/to/react-code-locator
```

## 빠른 시작

Vite 환경에서는 `createViteSourceAdapter()`가 source transform과 클라이언트 자동 주입을 함께 제공합니다.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createViteSourceAdapter } from "react-code-locator/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...createViteSourceAdapter({
      command,
      locator: { triggerKey: "shift" },
    }).config.plugins,
  ],
}));
```

개발 서버에서 `Shift + Click`하면 브라우저 콘솔에 이런 식으로 출력됩니다.

```text
[react-code-locator] src/components/Button.tsx:14:1 [jsx]
```

## 제공 엔트리

### `react-code-locator/vite`

Vite + React 프로젝트용 기본 진입점입니다.

- source transform 플러그인과 브라우저 클라이언트 주입 플러그인을 함께 제공합니다.
- HTML에는 bare import를 직접 넣지 않고 Vite 가상 모듈을 통해 클라이언트를 로드합니다.
- 기본값으로 브라우저 클라이언트도 자동 주입합니다.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createViteSourceAdapter } from "react-code-locator/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...createViteSourceAdapter({
      command,
      locator: { triggerKey: "shift" },
      injectClient: true,
    }).config.plugins,
  ],
}));
```

옵션:

- `command`: `"serve" | "build"` , 보통 Vite의 `command` 그대로 전달
- `locator.triggerKey`: `"alt" | "meta" | "ctrl" | "shift" | "none"`
- `locator.onLocate(result)`: 위치를 찾았을 때 커스텀 처리
- `locator.onError(error)`: 위치를 못 찾았을 때 커스텀 처리
- `injectClient`: `false`로 두면 브라우저 런타임 자동 주입 비활성화
- `babel`: source transform 옵션

### `react-code-locator/client`

브라우저 런타임만 수동으로 붙이고 싶을 때 사용합니다.

```ts
import { enableReactComponentJump } from "react-code-locator/client";

const dispose = enableReactComponentJump({
  triggerKey: "shift",
  onLocate(result) {
    console.log("located:", result.source, result.mode);
  },
});

// 필요 시 해제
dispose();
```

`react-code-locator/client`를 import하면 브라우저 전역에 `__REACT_CODE_LOCATOR_MCP__` bridge도 같이 설치됩니다.
이 bridge는 MCP 서버나 브라우저 자동화가 페이지 안에서 source resolve를 호출할 때 사용합니다.

### `react-code-locator/mcp`

Node에서 실행하는 MCP 서버 엔트리입니다.

```ts
import {
  createDisconnectedLocatorBrowserBridge,
  createLocatorMcpServer,
} from "react-code-locator/mcp";

const server = createLocatorMcpServer({
  bridge: createDisconnectedLocatorBrowserBridge(),
});
```

CLI도 제공합니다.

```bash
npx react-code-locator-mcp
```

자동 주입을 끄고 직접 붙이는 예시:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createViteSourceAdapter } from "react-code-locator/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...createViteSourceAdapter({
      command,
      injectClient: false,
    }).config.plugins,
  ],
}));
```

그 다음 앱 엔트리에서:

```ts
import { enableReactComponentJump } from "react-code-locator/client";

if (import.meta.env.DEV) {
  enableReactComponentJump();
}
```

### `react-code-locator/babel`

Babel 플러그인만 따로 사용할 때 사용합니다.

이 플러그인은 기본적으로 두 가지를 주입합니다.

- 커스텀 React 컴포넌트 JSX 호출부에 `$componentSourceLoc`
- React 컴포넌트 함수/클래스에 `__componentSourceLoc`
- intrinsic DOM JSX는 prop이 아니라 숨겨진 registry metadata로 추적합니다.

```js
const { babelInjectComponentSource } = require("react-code-locator/babel");

module.exports = {
  plugins: [babelInjectComponentSource],
};
```

ESM 설정 예시:

```ts
import { babelInjectComponentSource } from "react-code-locator/babel";

export default {
  plugins: [babelInjectComponentSource],
};
```

JSX 호출부 주입을 끄고 싶으면:

```ts
import { babelInjectComponentSource } from "react-code-locator/babel";

export default {
  plugins: [[babelInjectComponentSource, { injectJsxSource: false }]],
};
```

### `react-code-locator/webpack`

Webpack 설정에 Babel 플러그인과 런타임 엔트리를 함께 주입합니다.

```js
const { withReactComponentJump } = require("react-code-locator/webpack");
const config = createExistingWebpackConfig();

module.exports = withReactComponentJump(config, {
  env: process.env.NODE_ENV,
});
```

동작 방식:

- `env !== "development"`이면 원본 config를 그대로 반환
- `babel-loader`를 찾아 `babelInjectComponentSource`를 추가
- 엔트리 앞에 런타임 스크립트를 prepend

전제:

- React 앱이 Babel을 통해 트랜스파일되어야 합니다.
- `module.rules` 안에 `babel-loader`가 있어야 자동 주입이 동작합니다.

### `react-code-locator/esbuild`

esbuild 파이프라인에 source transform 플러그인을 붙일 때 사용합니다.

```ts
import { createEsbuildSourceAdapter } from "react-code-locator/esbuild";

const locator = createEsbuildSourceAdapter();
const plugins = [...locator.config.plugins];
```

### `react-code-locator/swc`

SWC 기반 파이프라인에서 공통 source transform을 호출할 때 사용합니다.

```ts
import { createSwcSourceAdapter } from "react-code-locator/swc";

const locator = createSwcSourceAdapter();
const transform = locator.config.transform;
```

### `react-code-locator`

런타임 유틸만 직접 사용할 때의 기본 엔트리입니다.

```ts
import { enableReactComponentJump, locateComponentSource } from "react-code-locator";
```

루트 엔트리는 브라우저 런타임 전용입니다.
빌드 도구 어댑터는 반드시 각 subpath에서 가져와야 합니다.

- Babel: `react-code-locator/babel`
- Vite: `react-code-locator/vite`
- esbuild: `react-code-locator/esbuild`
- SWC: `react-code-locator/swc`
- Webpack: `react-code-locator/webpack`

제공 API:

- `enableReactComponentJump(options)`
- `locateComponentSource(target)`

`locateComponentSource` 반환값:

```ts
type LocatorResult = {
  source: string;
  mode: "direct" | "screen" | "implementation";
};
```

## 사용 흐름

정상 동작하려면 보통 아래 두 단계가 같이 필요합니다.

1. 빌드 단계에서 source transform으로 소스 메타데이터 주입
2. 브라우저에서 클릭 이벤트를 가로채 React Fiber를 따라가며 위치 계산

Vite/webpack 어댑터를 쓰면 이 둘을 한 번에 붙일 수 있습니다.

## 개발/배포 스크립트

```bash
npm run build
```

- 라이브러리만 `dist/`로 빌드합니다.

```bash
npm run deploy --otp=123456
```

- `build`
- `npm pack --dry-run`
- `npm publish --access public`

순서로 실행합니다.

## peerDependencies

- `@babel/core >= 7`
- `@vitejs/plugin-react >= 4`

둘 다 optional peer dependency입니다.

- Babel 플러그인을 직접 쓰거나 Vite 어댑터를 쓸 때 필요할 수 있습니다.
- Webpack 런타임만 소비하는 쪽에서는 사용 방식에 따라 일부만 필요할 수 있습니다.

## 주의점

- 개발 모드 전용입니다.
- React 내부 필드인 Fiber와 `_debugSource`에 의존합니다.
- production build에서는 JSX 디버그 정보가 없어질 수 있습니다.
- 클릭 이벤트를 capture 단계에서 가로채므로, modifier key가 눌리면 기본 클릭 동작이 막힐 수 있습니다.
- `triggerKey: "none"`이면 모든 클릭에서 동작하므로 일반적으로 권장하지 않습니다.

## 주요 파일

- `src/runtime.ts`: 클릭 이벤트 처리와 React Fiber 기반 소스 탐색
- `src/babelInjectComponentSource.ts`: Babel 메타데이터 주입
- `src/vite.ts`: Vite 어댑터 export
- `src/webpack.cts`: Webpack 어댑터 export
- `src/client.ts`: 브라우저 런타임 export
