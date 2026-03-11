# React Component Jump

개발 중인 React 앱에서 요소를 `Shift + Click`하면, 정확한 JSX 태그 줄 또는 가장 가까운 컴포넌트 소스 위치를 콘솔에 찍는 로컬 패키지입니다.

## 포함된 기능

- Babel 변환으로 JSX `__source`와 컴포넌트 메타데이터 주입
- 브라우저 클릭 이벤트에서 React Fiber와 `_debugSource`를 이용해 소스 위치 계산
- Vite와 Webpack 양쪽에 붙일 수 있는 어댑터 제공
- 바로 테스트할 수 있는 React 데모 페이지 포함

## 이 레포에서 데모 실행

```bash
npm install
npm run dev
```

그 다음 브라우저에서 페이지를 열고 `Shift + Click`하면 브라우저 콘솔에 해당 컴포넌트 소스 위치가 출력됩니다.

## 다른 로컬 프로젝트에 적용

### 설치

```bash
npm i -D /absolute/path/to/react-component-jump
```

또는 대상 프로젝트의 `package.json`에서:

```json
{
  "devDependencies": {
    "react-component-jump": "file:../react-component-jump"
  }
}
```

### Vite 설정

```ts
import { defineConfig } from "vite";
import { reactComponentJump } from "react-component-jump/vite";

export default defineConfig(({ command }) => ({
  plugins: reactComponentJump({
    command,
    locator: {
      triggerKey: "shift",
    },
  }),
}));
```

### Webpack 설정

```js
const { withReactComponentJump } = require("react-component-jump/webpack");
const config = createExistingWebpackConfig();

module.exports = withReactComponentJump(config, {
  env: process.env.NODE_ENV,
});
```

### 실행 결과

개발 서버에서 `Shift + Click`하면 콘솔에 이런 식으로 출력됩니다.

```text
[react-component-jump] src/components/Button.tsx:14:1 [jsx]
```

## 패키지 빌드

```bash
npm run build:lib
```

라이브러리 산출물은 `dist/`에 생성됩니다.

## 주요 파일

- `src/babelInjectComponentSource.ts`: React 컴포넌트 정의에 소스 위치 메타데이터 주입
- `src/runtime.ts`: 클릭된 DOM에서 React Fiber를 따라 소스 위치 계산
- `src/vite.ts`: Vite 어댑터 export
- `src/webpack.cts`: Webpack 어댑터 export
- `demo/src/App.tsx`: 기능 확인용 데모 UI

## 주의점

- 개발 서버 전용입니다. `vite build`에서는 locator가 비활성화됩니다.
- 현재 구현은 React 개발 모드 기준입니다.
- JSX 줄은 React dev `_debugSource`를 우선 사용하고, 없으면 컴포넌트 정의 위치로 fallback 합니다.
- React 내부 필드에 의존하므로 React 메이저 버전 변경 시 보정이 필요할 수 있습니다.
