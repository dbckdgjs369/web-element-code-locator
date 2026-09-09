# 설계

## 문제

React 앱에서 화면의 엘리먼트를 클릭했을 때, 그 엘리먼트를 만든 소스 코드 위치로 점프하고 싶다.
React 19가 `fiber._debugSource`를 제거해서 런타임에서 위치를 알 방법이 사라졌다.

## v1이 택한 방법과 그 비용

v1(`react-code-locator`)은 번들러 플러그인의 `transform` 훅에서 소스 문자열을 받아
`@babel/parser`로 **다시 파싱**하고, 위치를 계산해 코드에 주입했다.

동작은 하지만 두 가지 대가가 있었다.

1. **중복 파싱.** 그 파일은 바로 직전에 이미 파싱됐다. dev 서버가 파일을 변환하려면
   반드시 파싱을 하기 때문이다. 우리는 같은 일을 한 번 더 한다.
2. **Turbopack 미지원.** `next.config.js`의 `webpack()` 훅에만 자기를 등록하는데,
   Turbopack은 그 훅을 호출하지 않는다. 에러도 경고도 없이 그냥 아무 일도 안 일어난다.

## 핵심 관찰

**컴파일러는 우리가 원하는 값을 이미 계산해서 코드에 박아 넣고 있다.**

```js
// 개발 모드 컴파일 결과 (Babel·SWC 공통)
jsxDEV(Button, { onClick: x }, void 0, false,
       { fileName: "src/App.tsx", lineNumber: 42, columnNumber: 7 },  // ← 이미 여기 있다
       this)
```

그러므로 문제는 "위치를 계산하는 것"이 아니라 **"React 19가 버리기 전에 가로채는 것"**이다.
이 관점 전환이 v2의 전부다.

## dev 서버 라이프사이클과 훅 지점

dev 서버는 부팅할 때 전체 소스를 파싱하지 않는다. Vite는 완전 lazy이고, Next는 라우트 단위
on-demand다. 따라서 "한 번 끼어드는" 그림이 아니라 **모듈 파이프라인에 상주하는** 그림이다.

```
[프로세스 부팅]  설정 확정, 플러그인 배열 확정            ★ A  다른 훅을 여는 열쇠
      ↓ listen()  — 아직 사용자 파일 0개 읽음
[모듈 요청]      resolveId → load → transform 체인
                   resolveId                             ★ C  모듈 치환
                   plugin-react 안에서 Babel 파싱 → AST   ★ D  재파싱 0
                   ...codegen → 문자열
                   우리 transform (문자열만 받음)         ★ E  재파싱 1
      ↓
[브라우저]       jsxDEV(..., __source, ...) 호출          ★ G  재파싱 0
                 React가 Fiber 생성 (여기서 __source 버림)
                 DOM 커밋 → 클릭 → 위치 조회              ★ H  소스맵 폴백
```

| 훅 | 받는 것 | 재파싱 | 커버리지 | 얻는 정보 |
|---|---|---|---|---|
| C | 모듈 요청 | — | Vite/webpack/Turbopack | G를 켜는 수단 |
| **D** | **AST (loc 포함)** | **0** | Babel 쓰는 환경만 | 컴포넌트 정의 위치 |
| E | 문자열 | 1 | 거의 전부 | 전부 (비싸다) |
| **G** | **`__source`** | **0** | automatic runtime 전부 | JSX 호출 위치 |
| H | 스택 + 소스맵 | 0 | 전부 | 근사치 |

## 채택: D + G 조합

**두 훅은 서로 다른 정보를 담당한다. 경쟁 관계가 아니라 보완 관계다.**

- **JSX 호출 위치** → 훅 G. 컴파일러가 이미 계산해줬다. 어느 번들러든 동작한다.
- **컴포넌트 정의 위치** → 훅 D. `const Card = memo(...)`가 몇 번째 줄인지는
  **어떤 컴파일러도 계산해주지 않는다.** AST를 직접 봐야만 알 수 있다.

이렇게 나누면 훅 D의 범위가 극적으로 줄어든다. JSX를 건드리지 않으므로 JSX 변환과의
플러그인 순서 문제도, JSXElement를 호출식으로 감쌀 때의 재진입 문제도 사라진다.
선언 뒤에 문장 하나를 덧붙이기만 하므로 자기 출력을 다시 볼 일이 없다.

## 훅 G를 켜는 두 가지 방법

`jsxDEV`를 우리 것으로 바꾸려면 컴파일러가 그 이름을 어디서 import하게 만들지를 정해야 한다.

1. **`jsxImportSource`** — tsconfig / 컴파일러 옵션. 표준적이지만 사용자 설정이 필요하고,
   emotion·theme-ui가 이미 점유했으면 충돌한다.
2. **모듈 해석 가로채기 (훅 C)** — `react/jsx-dev-runtime` 요청을 우리 모듈로 돌린다.
   Vite `resolveId`, webpack `resolve.alias`, Turbopack `resolveAlias`로 가능하고,
   **사용자 설정 파일을 건드리지 않는다.** 우리 모듈 자신의 import는 importer 검사로
   통과시켜 순환을 막는다.

2번이 DX 면에서 낫지만 Next가 React를 vendoring(`next/dist/compiled/react`)하는 탓에
Next에서 어떤 스펙으로 요청이 들어오는지 확인이 필요하다. 검증 항목이다.

## 버리는 선택지

- **훅 E(재파싱)를 기본 경로로 유지** — v1의 비용을 그대로 지불한다. 최후 폴백으로만 남긴다.
- **SWC Rust/Wasm 플러그인** — `swc_core` ABI가 호스트 SWC 버전과 정확히 맞아야 하고
  안 맞으면 빌드가 죽는다. Next 마이너 버전마다 재빌드·재배포가 필요해진다.
  그리고 애초에 그 SWC가 `__source`를 이미 뱉고 있으므로, 훅 G가 되는 한 이득이 없다.
  훅 D가 없는 환경의 **컴포넌트 정의 위치**만이 유일한 명분이고, 그건 근사치로
  충분한지 먼저 측정한 뒤에 판단한다.
- **esbuild AST 개입** — 확장점이 존재하지 않는다. Go로 짜도 못 들어간다.

## 검증이 필요한 전제

전부 실측 전이다. 하나라도 깨지면 위 설계가 바뀐다.

1. Next dev(SWC/Turbopack)가 실제로 `__source`를 emit하는가
2. Turbopack이 tsconfig `jsxImportSource`를 존중하는가
3. Vite `config()` 훅에서 plugin-react의 `babel.plugins`에 끼어들 수 있는가
   (옵션을 클로저에 캡처해버리면 불가능)
4. Turbopack `turbopack.rules`로 webpack loader를 태울 수 있는가 (커버리지 보험)

---

## 실측 결과 (2026-09-03)

전제 네 개를 모두 측정했다. 두 개가 예상과 달랐고, 설계가 그에 맞춰 바뀌었다.

### 1. `__source`는 나오지만, 정확도는 환경마다 다르다

| 환경 | `__source` | 줄 번호 정확도 |
|---|---|---|
| Vite + plugin-react | 나옴 | **+19줄 밀림** |
| Next webpack | 나옴 | 정확 |
| Next Turbopack | 나옴 | 정확 |

Vite가 밀리는 이유: `@vitejs/plugin-react`는 JSX 변환을 **esbuild에 위임**하고
(`esbuild: { jsx: "automatic" }`), Babel은 TS 제거·fast-refresh만 한다. Babel이
fast-refresh 프리앰블 19줄을 앞에 붙인 **뒤에** esbuild가 JSX를 변환하므로,
esbuild가 계산한 위치는 그만큼 밀린다.

**"컴파일러가 계산한 값이니 정확하다"는 전제는 틀렸다.** 정확한 조건은 따로 있다 —
파싱과 JSX 변환 사이에 코드가 움직이지 않을 것. Next의 SWC는 한 패스라 만족하고,
Vite의 Babel→esbuild 파이프라인은 만족하지 않는다.

그래서 훅 D의 범위를 되돌려 JSX 위치까지 담당하게 했다. AST의 원본 `loc`을 쓰므로
구조적으로 밀릴 수 없다.

### 2. Babel 자동 주입에는 공식 확장점이 있다

`@vitejs/plugin-react`는 `config.plugins` 전체에서 `api.reactBabel`을 모아 자신의
Babel 옵션과 함께 호출한다. 사용자가 `react({ babel: ... })`를 쓸 필요가 없다.
플러그인의 옵션 객체를 `config()`에서 직접 고치는 방법은 통하지 않는다 — 클로저에
캡처되기 때문이다.

### 3. Turbopack은 뚫린다. 단 제약이 세 겹이다

`turbopack.resolveAlias`로 `react/jsx-dev-runtime`을 우리 쉼으로 돌리면 동작한다.
`turbopack.rules`(webpack loader)는 필요 없었다. 걸린 것들:

1. **절대 경로 거부** — alias 값도, 쉼 내부 `require()`도. 전부 상대 경로여야 한다.
   ("server relative imports are not implemented yet")
2. **프로젝트 루트 밖 참조 거부** — npm-link나 모노레포 호이스팅이면 우리 패키지가
   루트 밖이다. 래퍼를 쉼 옆으로 복사해서 해결했다.
3. **vendored React** — Next는 `next/dist/compiled/react`를 앱에 연결한다. 프로젝트의
   평범한 `react`를 감싸면 React 내부 상태가 두 인스턴스로 갈려 첫 렌더에서
   `recentlyCreatedOwnerStacks` of undefined로 죽는다.

webpack 모드에는 네 번째 제약이 있다. App Router는 top-level `resolve.alias`가 아니라
**module rule 레이어별 `resolve.alias`**로 React를 해석하고, rule 단위가 top-level을
이긴다. `module.rules`를 재귀로 훑어 각 rule에도 alias를 넣어야 한다.

### 4. jsxImportSource는 결국 쓰지 않았다

훅 C(모듈 해석 가로채기)가 Vite·webpack·Turbopack 셋 다에서 통했고, 사용자 tsconfig를
건드리지 않아 DX가 낫다. `jsxImportSource` 검증은 불필요해져 취소했다.
