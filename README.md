# react-code-locator v2

렌더된 엘리먼트에서 그 엘리먼트를 만든 소스 위치로 점프한다. **소스를 다시 파싱하지 않고.**

v1은 번들러의 `transform` 훅에서 문자열을 받아 `@babel/parser`로 재파싱했다.
v2에는 재파싱 경로가 아예 없다 — 컴파일러가 이미 계산해둔 위치를 가로챈다.

설계 근거와 버린 선택지는 [DESIGN.md](./DESIGN.md).

## 상태

npm에 배포됨: `npm install -D react-code-locator` (1.0.2). 의존성 0개.

핵심 질문은 하나다: **"이 엘리먼트를 만든 내 코드가 어디인가"** (JSX 호출 위치).
컴포넌트 *정의* 위치(Alt+2)는 부가 기능으로 강등했다 — Vite에서만 나오고, 없어도 위 질문에는 답한다.

아래 표는 전부 실제 브라우저 렌더로 실측한 결과다. 추론으로 적은 행이 없다.
"검증" 열은 이 저장소에서 그대로 재현할 수 있는지까지 구분한다 — 재현 스크립트가 있는 행과
손으로 한 번 확인한 행은 다르다.

| 환경 | JSX 위치 | 검증 |
|---|---|---|
| Vite + `@vitejs/plugin-react` | 됨 | 실제 Chromium 렌더 (`playground/vite/e2e.mjs`) |
| Next.js 15 — webpack | 됨 (서버 컴포넌트 포함) | `next dev` 실측 (`playground/next`, next ^15.1.0) |
| Next.js 15 — **Turbopack** | 됨 (서버 컴포넌트 포함) | `next dev --turbopack` 실측 (`playground/next`) |
| Next.js 16 | 됨 | 수동 실측 — 저장소에 재현 스크립트 없음 |
| webpack 단독 (CRA 포함) | 됨 | 번들 실측 + 실서비스 앱(React 17 + webpack 5 + styled-components) |
| **rspack** | 됨 | 번들 실측 |
| **rollup** | 됨 | 번들 실측 |
| **esbuild** | 됨 | 번들 실측 |
| classic runtime + React ≤18 (Babel dev) | 됨 — `fiber._debugSource` 폴백, 절대 경로로 나온다 | React 18 실측 |
| classic runtime + **React 19** | **안 됨** — 조용히 null (앱은 멀쩡) | React 19 실측 |
| `React.createElement`/`cloneElement` 직접 호출 | △ — 가장 가까운 JSX 조상 위치가 나온다 | 실측 |
| Vite + `plugin-react-swc` | 미검증 | — |

**Turbopack이 동작한다.** v1의 가장 큰 제약이었다(`webpack()` 훅이 호출되지 않아 에러도 경고도 없이 아무 일도 일어나지 않았다).

classic + React 19 조합이 유일한 구멍이다. classic transform은 `react/jsx-dev-runtime`을
아예 import하지 않아 가로챌 지점이 없고, React 19는 `_debugSource`를 삭제했다.

프로덕션 빌드에는 0바이트다 — 모든 훅이 dev 전용 경로(`jsx-dev-runtime`)에만 붙는다.

## 쓰는 법

### Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactCodeLocator } from "react-code-locator";

export default defineConfig({
  plugins: [reactCodeLocator(), react()],
});
```

tsconfig도 안 건드리고 `react()`에 옵션도 안 넘긴다. Babel visitor는
plugin-react의 `api.reactBabel` 확장점을 통해 스스로 들어간다.

### Next.js (webpack·Turbopack 공통)

```js
// next.config.js
const { withReactCodeLocator } = require("react-code-locator/next");

module.exports = withReactCodeLocator({});
```

클라이언트 런타임은 직접 켠다 (Next에는 Vite의 `transformIndexHtml`에 해당하는 훅이 없다):

```tsx
"use client";
import { useEffect } from "react";
import { enableLocator } from "react-code-locator/runtime";

export function Locator() {
  useEffect(() => enableLocator({ triggerKey: "shift" }), []);
  return null;
}
```

### webpack · rspack 단독

```js
// webpack.config.js / rspack.config.js — 플러그인 하나가 양쪽을 다 덮는다.
const { ReactCodeLocatorPlugin } = require("react-code-locator/webpack");

module.exports = {
  plugins: [new ReactCodeLocatorPlugin()],
};
```

### rollup

```js
// rollup.config.js — @rollup/plugin-commonjs가 필요하다 (React를 번들하면 이미 있다).
import { rollupPlugin } from "react-code-locator/rollup";

export default { plugins: [rollupPlugin(), /* … */] };
```

### esbuild

```js
// jsx: "automatic" + jsxDev: true 로 빌드해야 한다 — 그게 __source의 출처다.
import { esbuildPlugin } from "react-code-locator/esbuild";

await esbuild.build({ jsx: "automatic", jsxDev: true, plugins: [esbuildPlugin()] });
```

단독 번들러 셋은 훅 C만 쓴다. 클라이언트 런타임은 Next처럼 직접 `enableLocator()`를 부르고,
"Open in editor"는 dev 서버에 `openInEditorMiddleware`를 직접 마운트해야 동작한다
(안 하면 Copy path만 된다). 검증은 `playground/bundlers/verify-*.mjs`.

## 조작

Shift를 누른 채로 — 커서 아래 엘리먼트가 하이라이트되고, 우클릭하면 "Open in editor" / "Copy path" 메뉴가 뜬다.
`Alt+1`은 **화면 위치**(그 엘리먼트를 쓴 JSX 줄), `Alt+2`는 **구현 위치**(그 엘리먼트를 렌더한 컴포넌트가 정의된 줄).

요청한 모드에 줄 게 없으면 다른 모드 값을 대신 보여주되 메뉴에 `(no distinct … location)`이라고 적는다.
`Alt+2`는 Babel이 있는 환경(Vite)에서만 자기 값을 가진다 — 아래 훅 D 설명 참고.

"Open in editor"가 때리는 엔드포인트는 감지한 개발서버에 따라 갈린다.
Next는 자체 에러 오버레이용으로 이미 갖고 있는 `/__nextjs_launch-editor`,
나머지(Vite·webpack·미지 서버)는 전부 `/__open-in-editor` — Vite에선 이 패키지가 심고,
webpack 계열에선 앱이 `openInEditorMiddleware`를 마운트했을 때 존재한다. 있는지 없는지
페이지에서 알 수 없으므로 **일단 보낸다**. 404면 토스트로 보고한다 — 조용히 아무 일도
안 일어나는 게 v1의 최악 실패였다. (webpack dev 서버는 전역 `webpackChunk*` 키로
감지하되, Next도 밑은 webpack이라 Next 판정이 먼저다.)

### 에디터 선택

서버 쪽이 여는 에디터는 이 순서로 정한다:

1. `openInEditorMiddleware({ editor })` 명시 옵션, 또는 `REACT_CODE_LOCATOR_EDITOR` 환경변수
2. `$VISUAL` / `$EDITOR` — 단, **vi·vim·nano 같은 터미널 에디터면 건너뛴다.**
   dev 서버가 detached로 spawn하면 붙을 TTY가 없어 아무것도 화면에 안 뜨기 때문이다
   (`$EDITOR=vi`는 매우 흔한 설정이라 이게 "눌러도 무반응"의 단골 원인이었다)
3. 실행 중인 GUI 에디터 자동 탐지 — VS Code(Insiders/Codium/Cursor/Windsurf 포함),
   JetBrains 전 제품군, Sublime, Zed
4. `code`

뭘 골랐는지 서버 콘솔에 한 줄 남기고, 에디터 CLI가 PATH에 없으면(spawn ENOENT)
그것도 콘솔에 해결법과 함께 찍는다.

## 훅 두 개가 담당하는 정보가 다르다

- **JSX 호출 위치** → 훅 G(`jsxDEV` 래퍼). 컴파일러가 dev 모드에 이미 5번째 인자로 넘긴다.
- **컴포넌트 정의 위치** → 훅 D(Babel visitor). `const Card = memo(...)`가 몇 번째 줄인지는
  어떤 컴파일러도 계산해주지 않는다. AST를 직접 봐야 한다.

Babel이 있는 환경(Vite)에서는 훅 D가 JSX 위치까지 담당한다.
`@vitejs/plugin-react`가 JSX 변환을 esbuild에 넘기고 그 전에 fast-refresh 프리앰블
19줄을 앞에 붙이는 탓에, 그 환경에서 훅 G가 받는 줄 번호가 그만큼 밀리기 때문이다.
Next는 SWC가 파싱부터 JSX 변환까지 한 패스에서 처리해 밀림이 없다 — 실측했다.

두 훅은 같은 레지스트리에 쓰고 훅 D가 바깥에서 실행되므로(`__rcl(jsxDEV(...))`),
정확한 값이 근사값을 자연스럽게 덮어쓴다.

## 서버 컴포넌트는 어떻게 되나

App Router의 기본값이라 이게 안 되면 대부분의 화면이 조회 불가다. 그런데 된다.

서버 컴포넌트의 `jsxDEV`는 Node에서 돌아 훅 G가 **서버 쪽** 레지스트리에 쓴다.
브라우저는 직렬화된 RSC 페이로드를 받고 거기엔 `__source`가 없다 — 여기까지는 막힌 길이다.
막히지 않는 이유는 React 19가 RSC로 보내는 엘리먼트마다 owner stack을 같이 실어 보내고,
클라이언트가 그걸 `fiber._debugStack`에 남겨두기 때문이다. 위치는 브라우저에 **있다**.
다만 컴파일된 서버 모듈 좌표로 적혀 있다:

```
webpack     at ServerPage (about://React/Server/webpack-internal:///(rsc)/./app/page.tsx?6:25:87)
Turbopack   at ServerPanel (about://React/Server/file:///….next/server/chunks/ssr/…_.js?4:26:263)
```

이걸 소스 위치로 바꾸려면 서버에만 존재했던 모듈의 소스맵이 필요한데, Next이 자기
에러 오버레이를 위해 그 변환을 `/__nextjs_original-stack-frames`로 이미 열어놓았다.
동일 출처 POST 한 번이면 된다. 크롬 익스텐션도, CDP도 필요 없다.

대가는 이 경로가 **비동기**라는 것이다. 그래서 `locate()`는 동기로 남겨두고
(호버가 프레임마다 부르니까) 이 경로는 `locateAsync()`가 담당한다. 한 번 받은 답은
프레임 좌표로 메모이즈되므로 같은 엘리먼트를 두 번째 볼 때는 동기 경로가 바로 답한다.

`src/rsc.ts`, 검증은 `playground/next/e2e-server.mjs`.

## 검증 돌리기

```bash
npm install && npm run build

cd playground/vite && npm install
node verify.mjs     # 훅 C·D·G 각각
node e2e.mjs        # 실제 Chromium 렌더

cd ../next && npm install
node check.mjs             # 번들에 실린 __source 페이로드
node e2e.mjs               # 클라이언트 컴포넌트, webpack
node e2e.mjs --turbo       # 클라이언트 컴포넌트, Turbopack
node e2e-server.mjs        # 서버 컴포넌트, webpack
node e2e-server.mjs --turbo  # 서버 컴포넌트, Turbopack

cd ../bundlers && npm install
node verify-webpack.mjs    # webpack 단독
node verify-rspack.mjs     # rspack (webpack 플러그인 그대로)
node verify-rollup.mjs
node verify-esbuild.mjs
```

`playground/next`는 tarball 설치를 쓴다. Turbopack이 프로젝트 루트 밖으로 나가는
심볼릭 링크(`file:../..`)를 해석하지 못해서다. `src`를 고치면
`npm run build && npm pack` 후 다시 설치해야 반영된다.

`npm pack`은 `package.json`의 현재 버전으로 파일명을 만든다. 즉 버전을 올린 뒤에는
`playground/next/package.json`의 `react-code-locator` 핀도 새 tarball 파일명으로 같이 바꿔야
그 버전을 검증하게 된다. 안 바꾸면 재검증이 예전 artifact를 대상으로 돌아간다.
