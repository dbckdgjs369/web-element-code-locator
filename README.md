# React Code Locator

개발 중인 React 앱에서 요소를 `Shift + Click`하면 해당 UI와 연결된 소스 위치를 찾는 패키지입니다.

- React element 생성 시 source metadata를 붙이고, 브라우저 런타임에서 Fiber를 따라 위치를 계산합니다.
- **Zero Dependency**: Babel 없이 acorn 기반으로 동작합니다.
- **Universal**: 하나의 패키지로 Vite, Webpack, Rollup, esbuild 모두 지원합니다.

## 설치

```bash
npm i -D react-code-locator unplugin
```

## 빠른 시작

### Vite

```ts
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

### Webpack (CRA 등)

```js
// config-overrides.js
const { webpackPlugin } = require('react-code-locator');

module.exports = {
  webpack: function(config, env) {
    if (env === 'development') {
      config.plugins.push(webpackPlugin());
    }
    return config;
  }
};
```

### Rollup

```js
import { rollupPlugin } from 'react-code-locator';

export default {
  plugins: [rollupPlugin()]
};
```

### esbuild

```js
import { esbuildPlugin } from 'react-code-locator';

const result = await esbuild.build({
  plugins: [esbuildPlugin()]
});
```

## 옵션

```ts
vitePlugin({
  projectRoot: process.cwd(),    // 프로젝트 루트 경로
  injectComponentSource: true,   // 컴포넌트 정의에 소스 주입
  injectJsxSource: true,         // JSX 호출부에 소스 주입
  include: /\.[jt]sx$/,          // 포함할 파일 패턴
  exclude: /node_modules/,       // 제외할 파일 패턴
});
```

## 사용

개발 서버에서 `Shift + Click`하면 브라우저 콘솔에 소스 위치가 출력됩니다.

```text
[react-code-locator] src/components/Button.tsx:14:1
```

### 단축키

- `Shift + Click`: 소스 위치 찾기
- `Alt + 1`: direct 모드 (JSX 호출부)
- `Alt + 2`: screen 모드 (화면 컴포넌트)
- `Alt + 3`: implementation 모드 (구현체)

### 클릭 복사

결과를 클릭하면 클립보드에 복사됩니다.

## 수동 주입 (고급)

자동 주입을 사용하지 않고 직접 런타임을 초기화하려면:

```ts
import { enableReactComponentJump } from "react-code-locator/client";

if (import.meta.env.DEV) {
  enableReactComponentJump({
    triggerKey: "shift",
    onLocate(result) {
      console.log("Source:", result.source);
    }
  });
}
```

## 주의점

- **개발 모드 전용**입니다.
- React 낵부 필드인 Fiber와 `_debugSource`에 의존합니다.
- production build에서는 동작하지 않습니다.

## License

MIT
