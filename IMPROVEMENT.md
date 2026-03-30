# Improvement Notes

code-inspector-plugin 분석을 통해 도출한 최적화 및 성능 개선 항목.

---

## 1. MagicString 도입 (transform.ts)

**현재 문제:**

```typescript
// 매 삽입마다 전체 문자열 슬라이스 + 연결 → O(n * m)
for (const { at, text } of insertions) {
  result = result.slice(0, at) + text + result.slice(at);
}
```

JSX 요소가 많고 파일이 클수록 삽입 횟수 × 파일 길이만큼 문자열 복사 발생.

**개선안:**

```typescript
import MagicString from "magic-string";

const s = new MagicString(code);
for (const { at, text } of insertions) {
  s.appendLeft(at, text); // 내부 segment 리스트에 O(1) 추가
}
return { code: s.toString(), map: s.generateMap() };
```

MagicString은 이중 연결 리스트 기반으로 O(1) 삽입. 소스맵 자동 생성 보너스까지 있음 (현재 소스맵 미반환).

**우선순위:** 높음 (파일이 클수록 효과 큼)

---

## 2. mousemove rAF throttle (runtime.ts)

**현재 문제:**

```typescript
const mouseMoveHandler = (event: MouseEvent) => {
  if (!triggerActive) return;
  // 마우스 이동 시마다 매번 호출 → 최대 60fps로 Fiber 탐색
  const result = locateComponentSource(event.target, currentMode, projectRoot);
  highlight?.update(elementTarget, result.source);
};
```

Fiber 트리 탐색은 상위로 올라가는 연산. 마우스가 빠르게 움직이면 초당 수십 번 실행됨.

**개선안:**

```typescript
let rafId: number | null = null;

const mouseMoveHandler = (event: MouseEvent) => {
  if (!triggerActive) return;
  if (rafId) return; // 이미 예약된 프레임 있으면 스킵

  const target = event.target;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const result = locateComponentSource(target, currentMode, projectRoot);
    // ...
  });
};
```

**우선순위:** 높음 (UX 직결)

---

## 3. mousemove 결과를 click에서 재탐색 (runtime.ts)

**현재 문제:**

```typescript
const mouseMoveHandler = (event: MouseEvent) => {
  const result = locateComponentSource(event.target, ...); // 1번 탐색
  highlight?.update(elementTarget, result.source);
};

const handler = (event: MouseEvent) => {
  const result = locateComponentSource(event.target, ...); // 또 탐색 (중복)
  handleLocate(result);
};
```

클릭 직전 mousemove에서 이미 결과를 구했는데 click에서 동일 대상을 다시 탐색.

**개선안:**

```typescript
let lastLocateResult: { target: Element; result: LocatorResult } | null = null;

const mouseMoveHandler = (event: MouseEvent) => {
  const result = locateComponentSource(event.target, ...);
  if (result) lastLocateResult = { target: elementTarget, result };
};

const handler = (event: MouseEvent) => {
  // 같은 target이면 캐시 재사용
  const result =
    lastLocateResult?.target === elementTarget
      ? lastLocateResult.result
      : locateComponentSource(event.target, ...);
};
```

**우선순위:** 중간

---

## 4. Fiber 키 탐색 WeakMap 캐싱 (runtime.ts)

**현재 문제:**

```typescript
function getReactFiberKey(element: Element) {
  // 매번 Object.keys() 호출 → 요소의 모든 키 열거
  return Object.keys(element).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
  );
}
```

같은 요소에 mousemove가 반복될 때마다 `Object.keys()` 재호출.

**개선안:**

```typescript
const fiberKeyCache = new WeakMap<Element, string | undefined>();

function getReactFiberKey(element: Element) {
  if (fiberKeyCache.has(element)) return fiberKeyCache.get(element);
  const key = Object.keys(element).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
  );
  fiberKeyCache.set(element, key);
  return key;
}
```

**우선순위:** 중간

---

## 5. resolveSourceCandidates dedup에 Set 사용 (runtime.ts)

**현재 문제:**

```typescript
if (file && !jsxCandidates.some((c) => c.source === jsxSource)) {
  jsxCandidates.push({ source: jsxSource, file });
}
```

Fiber 트리가 깊으면 `.some()` 탐색이 O(n²).

**개선안:**

```typescript
const jsxSourceSet = new Set<string>();
const componentSourceSet = new Set<string>();

if (file && !jsxSourceSet.has(jsxSource)) {
  jsxSourceSet.add(jsxSource);
  jsxCandidates.push({ source: jsxSource, file });
}
```

**우선순위:** 낮음~중간

---

## 6. 죽은 코드 제거 — appends 배열 (transform.ts)

**현재 문제:**

```typescript
const appends: string[] = []; // 선언됨

// ... 코드 어디서도 push 안 함

if (appends.length > 0) {  // 항상 false
  result += appends.join("");
}
```

`appends`는 선언만 되고 사용되지 않음.

**개선안:** `appends` 관련 코드 전부 제거.

**우선순위:** 낮음 (코드 정리)

---

## 7. normalizeSource regex 상수화 (runtime.ts)

**현재 문제:**

```typescript
function normalizeSource(source: string, projectRoot: string | undefined) {
  const match = source.match(/^(.*):(\d+):(\d+)$/); // 함수 호출마다 regex 객체 생성
}
```

**개선안:**

```typescript
const SOURCE_PATTERN = /^(.*):(\d+):(\d+)$/; // 모듈 레벨 상수

function normalizeSource(source: string, projectRoot: string | undefined) {
  const match = source.match(SOURCE_PATTERN);
}
```

**우선순위:** 낮음

---

## 8. isLocatorElement WeakSet으로 변경 (runtime.ts)

**현재 문제:**

```typescript
const LOCATOR_ATTRS = ["data-react-code-locator", ...]; // 5개
function isLocatorElement(el: Element) {
  return LOCATOR_ATTRS.some((attr) => el.hasAttribute(attr)); // 최대 5번 attribute 체크
}
```

mousemove 이벤트마다 5번 attribute 체크.

**개선안:**

```typescript
const locatorElements = new WeakSet<Element>();

// overlay, label, menu 등 생성 시 등록
locatorElements.add(overlay);
locatorElements.add(label);

function isLocatorElement(el: Element) {
  return locatorElements.has(el); // O(1)
}
```

**우선순위:** 낮음

---

## 우선순위 요약

| # | 항목 | 파일 | 영향도 | 난이도 |
|---|------|------|--------|--------|
| 1 | MagicString 도입 | transform.ts | 높음 | 낮음 |
| 2 | mousemove rAF throttle | runtime.ts | 높음 | 낮음 |
| 3 | mousemove 결과 캐싱 | runtime.ts | 중간 | 낮음 |
| 4 | Fiber 키 WeakMap 캐시 | runtime.ts | 중간 | 낮음 |
| 5 | dedup Set 변경 | runtime.ts | 낮음~중간 | 낮음 |
| 6 | appends 죽은 코드 제거 | transform.ts | 없음 | 낮음 |
| 7 | normalizeSource regex 상수화 | runtime.ts | 낮음 | 낮음 |
| 8 | isLocatorElement WeakSet | runtime.ts | 낮음 | 낮음 |
