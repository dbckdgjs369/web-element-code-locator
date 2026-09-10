# Improvement Notes

원래 이 문서는 v1(`transform.ts` 재파싱 + `unplugin` 어댑터) 기준으로 작성됐다.
v2에서 그 파일들이 사라졌고 대부분의 항목이 반영됐으므로, 아래는 **현재 코드 기준**으로 다시 정리한 것이다.

- 반영된 항목은 착지한 위치(`파일:줄`)를 적었다.
- v1 파일에만 해당했던 항목은 "무효"로 표시했다 — 개선이 아니라 대상 소멸이다.
- 남은 항목만 "열린 항목"에 있다.

---

## 반영 완료

| 이전 # | 항목 | 착지 위치 |
|---|---|---|
| 2 | mousemove rAF throttle | `src/runtime.ts:329` — 프레임당 한 번만 hit-test |
| 3 | 호버 결과를 클릭에서 재사용 | `src/runtime.ts:293`(`cached`), `src/runtime.ts:298-302`(`resultFor`) |
| 4 | Fiber 키 탐색 WeakMap 캐싱 | `src/locate.ts:50-59` — `Object.keys()` 결과를 요소별로 캐시 |
| 5 | 후보 dedup에 Set 사용 | `src/locate.ts:129-130` — `seenJsx` / `seenComponent` |
| 7 | `normalizeSource` regex 상수화 | `src/paths.ts:40` — `SOURCE_RE` 모듈 상수 |
| 8 | `isLocatorElement`를 WeakSet으로 | `src/runtime.ts:42` — `ownElements`, 등록은 `own()`(`:50`) |
| 9-1 | source map 제거 | `tsup.config.ts` — `sourcemap` 미설정(기본 false). 현재 `dist` 전체 320KB |

3번은 반영되면서 모드까지 캐시 키에 들어갔다(`{ target, mode, result }`). 모드만 바꿨을 때
이전 모드의 결과가 그대로 나오는 문제를 같이 막는다.

---

## 무효 (대상 파일 소멸)

| 이전 # | 항목 | 사유 |
|---|---|---|
| 1 | MagicString 도입 | `src/transform.ts`가 없다. v2에는 소스 문자열을 슬라이스·연결하는 경로가 아예 없다 — Babel 훅은 AST 노드를 추가하고(`src/babel/plugin.ts`), 그 외 통합은 모듈 해석만 바꾼다 |
| 6 | `appends` 죽은 코드 제거 | 같은 파일과 함께 사라졌다 |
| 9-2 | CJS/ESM 이중 빌드 축소 | 축소 대상이 아니다. `package.json` exports가 서브패스마다 `import`/`require` 조건을 노출하므로 두 포맷이 공개 계약이고, 런타임 의존성이 0개가 된 뒤로는(`package.json`에 `dependencies` 없음, `dist` 전체 320KB) 이중 빌드의 용량 부담 자체가 없다 |

---

## 열린 항목

### 1. 자동화된 테스트가 없다

`test/`가 v2 교체와 함께 삭제됐고 `package.json`에 `test` 스크립트가 없다. 현재 검증 수단은
`playground/*`의 스크립트 전부(`verify.mjs`, `e2e.mjs`, `check.mjs`, `verify-webpack.mjs` …)이고,
각각 별도 `npm install`과 실제 브라우저·번들러 실행을 요구한다.

번들러 없이 단위로 돌 수 있는 부분이 분명히 있다:

- `src/paths.ts` — `stripVirtualRoot` / `toProjectRelative` / `isProjectLocalFile`. 순수 함수이고
  Turbopack `[project]/` 마커, 절대→상대 변환, `node_modules` 판정이 모두 회귀에 취약하다.
- `src/rsc.ts:38` `FRAME_RE` — owner stack 프레임 파싱. 입력 문자열 두 종(webpack·Turbopack)이
  주석에 이미 실측값으로 적혀 있어 그대로 픽스처가 된다.
- `src/wrap.ts` `wrapJsxDev` — 가짜 `jsxDEV`를 넘겨 레지스트리에 무엇이 들어가는지, `__source`가
  없을 때 조용히 통과하는지.
- `src/editors.ts` `parseFileLocation` / `buildEditorArgs`.

**우선순위:** 높음. 이 목록은 전부 문자열 처리이고, 지금은 브라우저를 띄우지 않으면 깨진 걸 알 수 없다.

### 2. `locate()`가 매 프레임 fiber 트리를 루트까지 전부 훑는다

`collect()`(`src/locate.ts:126-156`)는 조기 종료가 없다. 후보를 찾은 뒤에도 `return` 체인을
루트까지 올라간다. 호버는 프레임당 한 번 이 함수를 부른다.

조기 종료가 자명하지 않은 이유가 있다. `resolve()`는 "가장 가까운 로컬 컴포넌트 정의 파일"을 먼저 정하고
그 파일 안의 JSX 후보를 찾으므로(`src/locate.ts:167-180`), 첫 후보만 보고 끊으면 styled-components를
별 파일로 모아둔 프로젝트에서 답이 바뀐다. 실제로 바꾸려면 그 규칙을 유지하는 종료 조건을 먼저 정의해야 한다.

**우선순위:** 중간. 프레임당 1회로 이미 throttle돼 있으므로 측정 없이 손대지 말 것.

### 3. 호버 캐시가 한 칸이다

`cached`(`src/runtime.ts:293`)는 단일 슬롯이다. 두 요소 사이를 왕복하면 매번 재탐색한다.
`WeakMap<Element, Record<LocatorMode, LocatorResult>>`로 바꾸면 사라지는 비용이지만,
2번을 재보기 전에는 실익이 불분명하다.

**우선순위:** 낮음.

### 4. regex 상수화가 두 곳 남았다

7번을 `src/paths.ts`에만 적용했다. 같은 패턴이 `src/dev-server.ts:58`(`editorRequestFor`,
"Open in editor"마다 실행)과 `src/editors.ts:46,50`에 리터럴로 남아 있다.
`src/runtime.ts:155`의 라벨 정리 regex 두 개는 호버 프레임마다 실행된다.

리터럴 정규식은 V8이 패턴을 컴파일해두므로 실측 이득은 거의 없다. 일관성 항목으로만 기록한다.

**우선순위:** 낮음.

### 5. `src/rsc.ts`의 메모 맵이 무한 증가한다

`resolved` / `inFlight`(`src/rsc.ts:81-82`)는 문자열 키 `Map`이라 WeakMap처럼 비워지지 않는다.
키는 `file|line|column`이므로 상한은 "세션 중 호버한 서로 다른 서버 프레임 수"다.
실사용에서 문제가 될 규모는 아니지만, 이 파일에서 유일하게 해제 경로가 없는 상태다.

**우선순위:** 낮음.

---

## 우선순위 요약

| # | 항목 | 파일 | 영향도 | 난이도 |
|---|---|---|---|---|
| 1 | 순수 함수 단위 테스트 도입 | paths·rsc·wrap·editors | 높음 | 낮음 |
| 2 | `collect()` 조기 종료 | locate.ts | 중간 | 중간(규칙 정의가 선행) |
| 3 | 호버 캐시 다중 슬롯 | runtime.ts | 낮음 | 낮음 |
| 4 | 남은 regex 상수화 | dev-server·editors·runtime | 낮음(일관성) | 낮음 |
| 5 | rsc 메모 맵 상한 | rsc.ts | 낮음 | 낮음 |
