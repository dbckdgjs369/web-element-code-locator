# Troubleshooting

v2 기준 문서다. v1(재파싱 + `enableReactComponentJump`) 관련 항목은 아키텍처가 사라졌으므로 전부 걷어냈다.
구조 설명은 [DESIGN.md](./DESIGN.md), 환경별 지원 현황은 [README.md](./README.md).

각 항목은 증상 → 원인 → 해결 순서다.

---

## 클릭해도 아무 반응이 없어요

**1. 클라이언트 런타임을 켰는지 확인하세요.**

Vite만 자동입니다(`transformIndexHtml`로 클라이언트 모듈을 주입). Next·webpack·rspack·rollup·esbuild는
앱이 직접 `enableLocator()`를 불러야 합니다.

```tsx
"use client";
import { useEffect } from "react";
import { enableLocator } from "react-code-locator/runtime";

export function Locator() {
  useEffect(() => enableLocator({ triggerKey: "shift" }), []);
  return null;
}
```

**2. 트리거 키를 확인하세요.**

기본값은 `shift`입니다. Shift를 **누른 채로** 움직여야 하이라이트가 뜨고, 그 상태에서 클릭·우클릭해야 합니다.
`triggerKey: "none"`으로 두면 항상 무장 상태가 됩니다.

**3. 빌드 훅이 꺼지는 조건을 확인하세요.**

| 통합 | 활성 조건 |
|---|---|
| Vite (`reactCodeLocator`) | `apply: "serve"` — dev 서버에서만, 프로덕션 빌드에선 아무것도 안 함 |
| Next (`withReactCodeLocator`) | `NODE_ENV !== "production"` |
| webpack·rspack (`ReactCodeLocatorPlugin`) | `mode !== "production"` |
| rollup·esbuild | 항상 켜짐(`enabled` 기본 true) — 단 프로덕션 변환에는 `jsxDEV`가 없어 무해 |

프로덕션 빌드에서 동작하지 않는 것은 의도된 동작입니다. 모든 훅이 dev 전용 경로(`react/jsx-dev-runtime`)에만 붙습니다.

**4. `disabled` 요소나 `pointer-events: none` 요소는 이벤트 타깃이 되지 않습니다.**

해당 요소의 부모를 클릭하세요.

---

## "No source metadata found for the clicked element." 가 콘솔에 찍혀요

`locate()`와 `locateAsync()` 둘 다 답을 못 찾은 경우입니다. 순서대로 확인하세요.

**1. automatic JSX runtime + dev 변환인가.**

이 패키지는 `react/jsx-dev-runtime`을 가로채는 것이 전부입니다(`src/wrap.ts`).
classic 변환(`React.createElement`)은 그 모듈을 import하지 않으므로 가로챌 지점 자체가 없습니다.
아래 "classic runtime" 항목 참고.

**2. JSX로 만들지 않은 엘리먼트인가.**

`React.createElement` / `cloneElement` 직접 호출, 또는 라이브러리가 손으로 조립한 엘리먼트에는
`__source`가 없습니다(`src/wrap.ts:60`). 이 경우 fiber 트리를 올라가다 만나는 **가장 가까운 JSX 조상**의
위치가 대신 나오거나, 아무것도 없으면 조용히 null입니다.

**3. 서버 컴포넌트인가.** 아래 "서버 컴포넌트" 항목 참고.

---

## classic runtime + React 19에서 아무것도 안 잡혀요 (조용히 null)

**원인:** 두 경로가 동시에 막힙니다.

- classic 변환은 `react/jsx-dev-runtime`을 import하지 않습니다 → 훅 G(`jsxDEV` 래퍼)가 실행될 일이 없습니다.
- 폴백인 `fiber._debugSource`(`src/locate.ts:81`)를 React 19가 삭제했습니다.

에러도 경고도 없이 `null`이 나오고 앱은 정상 동작합니다. v2에서 알려진 유일한 구멍입니다.

**해결:** automatic runtime으로 컴파일하세요 (`jsx: "react-jsx"` / dev 빌드에서 `react-jsxdev`).
번들러별 설정은 아래 esbuild 항목과 README를 참고하세요.

**참고 — React ≤18 + classic은 동작하지만 경로가 다릅니다.** `_debugSource` 폴백이 살아 있어 위치는 나오지만,
그 값은 Babel classic 변환이 넣은 원본이라 우리 래퍼를 거치지 않습니다. 즉 **절대 경로**로 나옵니다
(automatic 경로는 `projectRoot`를 떼어 프로젝트 상대 경로로 만듭니다 — `src/wrap.ts:52`).
같은 프로젝트에서 경로 표기가 섞여 보이면 이 조합인지 확인하세요.

---

## esbuild에서 위치가 안 잡혀요

**원인:** esbuild가 `__source` 인자를 넣도록 빌드하지 않았습니다. 플러그인은 모듈 해석만 바꿉니다
(`src/integrations/esbuild.ts:10`).

**해결:** `jsx: "automatic"` + `jsxDev: true`로 빌드하세요. tsconfig `"jsx": "react-jsxdev"`도 동등합니다.

```js
await esbuild.build({
  jsx: "automatic",
  jsxDev: true,
  plugins: [esbuildPlugin()],
});
```

`jsx: "automatic"`만 켜고 `jsxDev`를 빠뜨리면 `jsx()`가 나오고 소스 인자가 아예 없습니다.

---

## rollup 빌드가 shim에서 깨져요 / `exports is not defined`

**원인:** 생성되는 shim이 CommonJS입니다(`src/integrations/rollup.ts:9`, `src/integrations/shim.ts`).
webpack·Turbopack·esbuild와 사이클을 만들지 않기 위한 선택이고, rollup도 같은 파일을 씁니다.

**해결:** `@rollup/plugin-commonjs`를 플러그인 목록에 넣으세요. React를 번들에 포함하는 설정이면 이미 있습니다.

```js
import commonjs from "@rollup/plugin-commonjs";
import { rollupPlugin } from "react-code-locator/rollup";

export default { plugins: [rollupPlugin(), commonjs(), /* … */] };
```

---

## CRA(Create React App)에서 플러그인을 넣을 데가 없어요

eject하지 않은 CRA는 webpack 설정이 숨어 있습니다. `craco` 또는 `react-app-rewired`가 필요합니다.

```js
// config-overrides.js  (react-app-rewired)
const { ReactCodeLocatorPlugin } = require("react-code-locator/webpack");

module.exports = {
  webpack(config) {
    config.plugins.push(new ReactCodeLocatorPlugin());
    return config;
  },
};
```

```json
"start": "react-app-rewired start"
```

**"falls outside of the project src/ directory" 에러는 자동으로 처리됩니다.**
CRA 계열 설정은 react-dev-utils의 `ModuleScopePlugin`을 돌려 `src/` 밖 import를 전부 거부하는데,
생성된 shim이 `node_modules/.cache` 아래 있어 정확히 거기에 걸립니다. 플러그인이 shim과 `wrap.js`를
그 allow-list에 직접 넣습니다(`src/integrations/webpack.ts:74-82`). 직접 뭘 할 필요는 없습니다.

---

## Turbopack에서 동작하지 않아요

**Turbopack은 지원됩니다.** `turbopack.resolveAlias`로 `react/jsx-dev-runtime`을 shim으로 돌립니다
(`src/integrations/next.ts:96`). 서버 컴포넌트까지 포함해 실측한 결과가 README 표에 있습니다.
그래도 안 되면 아래 순서로 확인하세요.

**1. `next.config.js`가 래퍼를 통과하는지.**

```js
const { withReactCodeLocator } = require("react-code-locator/next");
module.exports = withReactCodeLocator({});
```

`turbopack` 키를 직접 쓰고 있었다면 래퍼가 기존 값을 병합하므로 그대로 둬도 됩니다.

**2. 이 패키지가 프로젝트 루트 밖에 있는지 (심볼릭 링크).**

Turbopack은 프로젝트 루트 밖으로 나가는 참조를 해석하지 못합니다. `npm link`, `file:../..`,
모노레포 호이스팅이면 패키지가 루트 밖입니다. shim 자체는 `wrap.js`를 자기 옆으로 복사해 이 문제를
피하지만(`src/integrations/shim.ts:95-99`), 패키지를 심볼릭 링크로 설치했으면 여전히 깨집니다.

**해결:** tarball로 설치하세요. 이 저장소의 `playground/next`가 그렇게 하는 이유입니다.

```bash
npm run build && npm pack     # 저장소 루트
cd playground/next && npm install ../../react-code-locator-<version>.tgz
```

**3. 절대 경로를 직접 넣지 마세요.** alias 값도, shim 내부 `require()`도 전부 상대 경로여야 합니다.
절대 경로를 주면 `server relative imports are not implemented yet`로 죽습니다(`src/integrations/shim.ts:87-89`).

---

## Vite에서 줄 번호가 19줄쯤 밀려요

**원인:** `@vitejs/plugin-react`는 JSX 변환을 esbuild에 넘기고, 그 전에 Babel이 fast-refresh 프리앰블
약 19줄을 앞에 붙입니다. esbuild가 계산한 `__source`는 그만큼 밀린 텍스트 기준입니다
(DESIGN.md "실측 결과" 1번).

그래서 Vite에서는 Babel 훅(훅 D)이 AST의 원본 `loc`으로 JSX 위치까지 덮어씁니다.

**해결:** `componentDefinitions: false`로 껐다면 다시 켜세요. 그 옵션은 훅 D 전체를 끄기 때문에
컴포넌트 정의 위치뿐 아니라 **JSX 위치의 정확도까지** 같이 잃습니다(`src/integrations/vite.ts:39`).

Next(SWC)는 파싱부터 JSX 변환까지 한 패스라 밀림이 없습니다 — 실측했습니다.

---

## `Alt+2`(구현 위치)가 `Alt+1`과 같은 값을 보여줘요

메뉴 헤더에 `(no distinct implementation location)`이 붙습니다.

**원인:** 컴포넌트 *정의* 위치는 어떤 컴파일러도 계산해주지 않아 AST를 봐야 하고, 그건 Babel 훅(훅 D)만 할 수 있습니다.
Babel 패스가 있는 환경은 Vite뿐입니다. Next는 SWC(JS 플러그인 불가), 단독 번들러는 훅 C만 씁니다.

**해결:** 없습니다 — 설계상의 범위입니다. 요청한 모드에 값이 없으면 다른 모드 값을 대신 보여주되
라벨에 명시합니다(`src/locate.ts:193-202`). 조용히 다른 값을 정답처럼 보여주지 않는 것이 요점입니다.

---

## "Open in editor"를 눌렀는데 아무 일도 안 일어나요

먼저 브라우저 콘솔과 토스트를 보세요. v2는 실패를 삼키지 않습니다.

**`Editor endpoint answered 404` 가 보이면 — 서버에 엔드포인트가 없습니다.**

엔드포인트는 감지한 dev 서버에 따라 갈립니다(`src/dev-server.ts:56-77`).

| 감지된 서버 | 엔드포인트 | 누가 심는가 |
|---|---|---|
| Next | `/__nextjs_launch-editor` | Next 자체 (할 일 없음) |
| Vite | `/__open-in-editor` | 이 패키지의 Vite 플러그인이 자동 |
| webpack·rspack·rollup·esbuild·미지 | `/__open-in-editor` | **앱이 직접 마운트해야 함** |

단독 번들러 셋은 HTML 훅이 없어 자동으로 심을 수 없습니다. 직접 마운트하세요.

```js
// webpack.config.js
const { openInEditorMiddleware, OPEN_IN_EDITOR_PATH } = require("react-code-locator");

module.exports = {
  devServer: {
    setupMiddlewares(middlewares, devServer) {
      devServer.app.use(OPEN_IN_EDITOR_PATH, openInEditorMiddleware());
      return middlewares;
    },
  },
};
```

마운트하지 않아도 "Copy path"는 동작합니다.

**아무 로그도 없으면 — `openInEditor` 옵션이 꺼져 있습니다.** `enableLocator({ openInEditor: true })`.
Vite 자동 주입 경로는 기본으로 켜져 있습니다(`src/integrations/vite.ts:109`).

---

## 엔드포인트는 200인데 에디터가 안 떠요

**원인:** 서버가 고른 에디터가 화면에 뜰 수 없는 것입니다. 선택 순서는 이렇습니다
(`src/open-in-editor.ts:80-100`).

1. `openInEditorMiddleware({ editor })` 명시 옵션 또는 `REACT_CODE_LOCATOR_EDITOR` 환경변수
2. `$VISUAL` / `$EDITOR` — **단 vi·vim·nvim·nano·emacs·helix 같은 터미널 에디터면 건너뜁니다.**
   dev 서버가 detached로 spawn하면 붙을 TTY가 없어 아무것도 안 뜹니다. `$EDITOR=vi`는 매우 흔한 설정이라
   "눌러도 무반응"의 단골 원인이었습니다(`src/open-in-editor.ts:29-32`).
3. 실행 중인 GUI 에디터 자동 탐지 — VS Code(Insiders/Codium/Cursor/Windsurf), JetBrains 전 제품군, Sublime, Zed
4. `code`

무엇을 골랐는지 서버 콘솔에 한 줄 남습니다: `[react-code-locator] opening files with "…"`.

**해결:** 그 줄이 원하는 에디터가 아니면 환경변수로 못 박으세요.

```bash
REACT_CODE_LOCATOR_EDITOR=cursor npm run dev
```

**`could not launch "…": Error: spawn … ENOENT` 가 찍히면** 고른 에디터 CLI가 PATH에 없습니다
(VS Code는 명령 팔레트의 "Shell Command: Install 'code' command in PATH"). spawn ENOENT는 throw가 아니라
비동기 `error` 이벤트로 오기 때문에 리스너를 달아 콘솔에 찍고 있습니다(`src/open-in-editor.ts:111-118`).

---

## 서버 컴포넌트가 안 잡혀요

**원인:** 서버 컴포넌트의 `jsxDEV`는 Node에서 돌아 **서버 쪽** 레지스트리에 씁니다. 브라우저가 받는
RSC 페이로드에는 `__source`가 없습니다. 그래서 이 경로만 별도입니다: React 19가 같이 실어 보내는
owner stack(`fiber._debugStack`)을 읽고, 컴파일된 서버 모듈 좌표를 Next의
`/__nextjs_original-stack-frames`로 역매핑합니다(`src/rsc.ts`).

성립 조건이 세 개입니다. 하나라도 어긋나면 `null`입니다.

- **dev 서버가 Next로 감지되어야 합니다** — `resolveOwnerSource`는 그 외 환경에서 즉시 `null`을 반환합니다(`src/rsc.ts:131`).
- **React 19여야 합니다** — owner stack이 그때 들어왔습니다.
- **비동기 경로입니다** — 첫 호버는 왕복이 필요합니다. 답이 오면 그때 하이라이트를 갱신하고,
  같은 프레임 좌표는 메모이즈되므로 두 번째부터는 동기로 즉답합니다. 클릭·우클릭은 `locateAsync`를 쓰므로
  항상 이 경로를 탑니다.

프로덕션 빌드에는 owner stack이 없습니다.

---

## `[react-code-locator] could not resolve the React JSX dev runtime from …; skipping` 경고가 떠요

**원인:** shim 생성기가 `projectRoot`의 `package.json` 기준으로 `react/jsx-dev-runtime`(Next는
`next/dist/compiled/react/jsx-dev-runtime` 우선)과 `react-code-locator/wrap`을 `require.resolve`하는데
둘 중 하나가 해석되지 않았습니다(`src/integrations/shim.ts:49-70`).

빌드를 죽이지 않고 "위치 조회 불가"로만 강등되므로, 이 경고가 조용한 무동작의 유일한 단서입니다.

**해결:**

- 플러그인에 `projectRoot`를 넘겨 실제 프로젝트 루트를 맞추세요(기본값은 `process.cwd()` 또는 webpack의 `compiler.context`).
- pnpm strict 모드처럼 호이스팅이 없는 설치에서는 `react`가 앱에서 직접 해석되는지 확인하세요.
- 모노레포에서 dev 서버를 루트에서 띄운 경우 `projectRoot`가 앱 디렉터리를 가리켜야 합니다.

---

## 일부 요소만 잡히고 나머지는 null이에요 (패키지 인스턴스 중복)

**원인 후보 1 — 레지스트리 분리.** 레지스트리는 `globalThis[Symbol.for("react-code-locator.registry")]`에
매달려 있어서 pnpm·모노레포·오래된 `optimizeDeps` 캐시로 이 패키지가 두 벌 로드돼도 하나로 수렴합니다
(`src/registry.ts:26-34`). 즉 이건 보통 원인이 아닙니다.

**원인 후보 2 — React 인스턴스 분리.** 이쪽이 실제 원인입니다. 우리 래퍼가 감싼 React와 앱이 렌더에 쓰는
React가 다른 사본이면, 감싼 쪽을 통과하지 않은 엘리먼트는 레지스트리에 아무것도 남기지 않습니다.

**해결:**

- Vite: `rm -rf node_modules/.vite` 후 재시작. 플러그인은 우리 래퍼를 pre-bundle 대상에서 제외하지만
  (`src/integrations/vite.ts:80-85`), 그 설정이 들어오기 전에 만들어진 캐시는 남아 있습니다.
- `react`·`react-dom`이 한 벌인지 확인하세요(`npm ls react`). 모노레포면 dedupe.
- Next는 `next/dist/compiled/react`를 앱에 연결하므로 통합이 그 사본을 우선합니다
  (`src/integrations/next.ts:38`). 프로젝트의 평범한 `react`를 강제로 감싸면 첫 렌더에서
  `recentlyCreatedOwnerStacks of undefined`로 죽습니다.

---

## webpack: `resolve.alias is an array; add the alias yourself` 경고가 떠요

**원인:** `resolve.alias`가 배열 형태(`{ alias, name }` 객체 리스트)입니다. 여기에 정확 매칭 레코드를
병합하면 의미가 조용히 바뀌므로 플러그인이 손대지 않고 물러납니다(`src/integrations/webpack.ts:56-62`).

**해결:** 경고에 찍힌 대로 직접 넣으세요.

```js
resolve: {
  alias: [
    { alias: "<경고에 찍힌 shim 경로>", name: "react/jsx-dev-runtime", onlyModule: true },
    /* 기존 항목 */
  ],
}
```

---

## src를 고쳤는데 playground/next에 반영되지 않아요

`playground/next`는 심볼릭 링크가 아니라 tarball 설치를 씁니다(위 Turbopack 항목의 이유).
따라서 재빌드만으로는 반영되지 않습니다.

```bash
npm run build && npm pack
cd playground/next && npm install ../../react-code-locator-<version>.tgz
```

`playground/vite`와 `playground/bundlers`는 로컬 참조라 재빌드만으로 반영됩니다.
