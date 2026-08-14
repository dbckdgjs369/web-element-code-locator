/**
 * Runtime-level regression tests for react-code-locator.
 *
 * There is no browser / React here, so we build synthetic React fiber trees that
 * mimic what react-dom attaches, then drive `locateComponentSource` against a fake
 * DOM element carrying a `__reactFiber$` key.
 *
 * This lets us verify the resolution logic (screen vs implementation mode) and the
 * runtime fallbacks (React 19 has no `_debugSource`, etc.) deterministically.
 *
 * Run:  npm run test:runtime
 */

// --- minimal DOM globals so `x instanceof Element/Node` works in Node ----------
class FakeNode {}
class FakeElement extends FakeNode {
  parentElement: FakeElement | null = null;
}
(globalThis as any).Node = FakeNode;
(globalThis as any).Element = FakeElement;

import { locateComponentSource } from "../src/runtime.ts";
import { JSX_SOURCE_REGISTRY_SYMBOL, JSX_SOURCE_PROP, SOURCE_PROP } from "../src/constants.ts";

let passed = 0;
let failed = 0;
const rows: Array<{ status: string; name: string; detail?: string }> = [];

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function test(name: string, fn: () => void) {
  try {
    fn();
    rows.push({ status: "PASS", name });
    passed++;
  } catch (e) {
    rows.push({ status: "FAIL", name, detail: (e as Error).message });
    failed++;
  }
}

// --- fiber/element builders ----------------------------------------------------
type Fiber = {
  type?: unknown;
  elementType?: unknown;
  pendingProps?: Record<string, unknown> | null;
  memoizedProps?: Record<string, unknown> | null;
  return?: Fiber | null;
  _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number } | null;
};

function componentFn(name: string, source: string) {
  const fn: any = function () {};
  Object.defineProperty(fn, "name", { value: name });
  fn[SOURCE_PROP] = source;
  return fn;
}

/**
 * Mirrors what the injected `__rcl()` helper does at runtime: register the JSX
 * source against the element's props object in a global WeakMap, so nothing is
 * written into props themselves.
 */
function registryProps(source: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const key = Symbol.for(JSX_SOURCE_REGISTRY_SYMBOL);
  const registry =
    ((globalThis as any)[key] as WeakMap<object, string>) ??
    ((globalThis as any)[key] = new WeakMap<object, string>());
  registry.set(props, source);
  return props;
}

/** Build a fiber chain from an array ordered leaf -> root. */
function chain(fibers: Fiber[]): Fiber {
  for (let i = 0; i < fibers.length - 1; i++) fibers[i].return = fibers[i + 1];
  fibers[fibers.length - 1].return = null;
  return fibers[0];
}

function elementWithFiber(fiber: Fiber): any {
  const el = new FakeElement();
  (el as any)["__reactFiber$abc123"] = fiber;
  return el;
}

// ==============================================================================
// R1: normal click resolves to the element's JSX source (React 19 style — NO _debugSource)
// ==============================================================================
test("R1: host element inside a project component resolves (screen mode, React 19)", () => {
  const CardFn = componentFn("Card", "src/Card.tsx:3:1");
  const AppFn = componentFn("App", "src/App.tsx:2:1");
  const root = chain([
    { type: "div", pendingProps: registryProps("src/Card.tsx:5:5") }, // clicked <div>
    { type: CardFn, pendingProps: registryProps("src/App.tsx:10:7") }, // <Card/> usage
    { type: AppFn, pendingProps: {} },
  ]);
  const result = locateComponentSource(elementWithFiber(root), "screen");
  eq(result?.source, "src/Card.tsx:5:5", "screen source");
});

// ==============================================================================
// R2: implementation mode surfaces the component definition rather than the usage
// ==============================================================================
test("R2: implementation mode falls back to project source when no external lib", () => {
  const CardFn = componentFn("Card", "src/Card.tsx:3:1");
  const root = chain([
    { type: "div", pendingProps: registryProps("src/Card.tsx:5:5") },
    { type: CardFn, pendingProps: registryProps("src/App.tsx:10:7") },
  ]);
  const result = locateComponentSource(elementWithFiber(root), "implementation");
  // no node_modules component in the chain -> falls back to a project-local source
  eq(typeof result?.source, "string", "implementation source present");
});

// ==============================================================================
// R3: pre-React-19 fallback — no injected props/type, but `_debugSource` present
// ==============================================================================
test("R3: resolves via _debugSource when injection is absent (pre-React 19)", () => {
  const root = chain([
    {
      type: "span",
      pendingProps: {},
      _debugSource: { fileName: "/proj/src/Legacy.jsx", lineNumber: 12, columnNumber: 3 },
    },
  ]);
  const result = locateComponentSource(elementWithFiber(root), "screen", "/proj");
  eq(result?.source, "src/Legacy.jsx:12:3", "debugSource-derived source");
});

// ==============================================================================
// R4: memo()/forwardRef() component objects (type.type / type.render)
// ==============================================================================
test("R4: resolves component source through memo()/forwardRef() wrapper objects", () => {
  const innerFn = componentFn("Card", "src/Card.tsx:3:1");
  const memoObject: any = { type: innerFn }; // React.memo(...) shape
  const root = chain([
    { type: "div", pendingProps: {} }, // no jsx source on host
    { type: memoObject, pendingProps: {} },
  ]);
  const result = locateComponentSource(elementWithFiber(root), "implementation");
  eq(result?.source, "src/Card.tsx:3:1", "memo component source");
});

// ==============================================================================
// R5: no fiber on the element -> returns null gracefully (no throw)
// ==============================================================================
test("R5: element with no React fiber returns null", () => {
  const el = new FakeElement();
  const result = locateComponentSource(el as any, "screen");
  eq(result, null, "null when no fiber");
});

// ==============================================================================
// R6: WeakMap registry is the primary JSX source channel — props stay clean
// ==============================================================================
test("R6: JSX source is read from the WeakMap registry, not from props", () => {
  const props = registryProps("src/Card.tsx:5:5");
  const root = chain([{ type: "div", pendingProps: props }]);
  const result = locateComponentSource(elementWithFiber(root), "screen");
  eq(result?.source, "src/Card.tsx:5:5", "registry source");
  eq(Object.keys(props).length, 0, "props must carry no locator keys");
});

// ==============================================================================
// R7: legacy prop-based injection still resolves (backwards compatibility with
//     code transformed by an older version of the plugin)
// ==============================================================================
test("R7: legacy $componentSourceLoc prop still resolves", () => {
  const root = chain([{ type: "div", pendingProps: { [JSX_SOURCE_PROP]: "src/Old.tsx:9:2" } }]);
  const result = locateComponentSource(elementWithFiber(root), "screen");
  eq(result?.source, "src/Old.tsx:9:2", "legacy prop source");
});

// ==============================================================================
// R8: the click target walks up to the nearest ancestor that has a fiber
// ==============================================================================
test("R8: non-React descendant walks up to the nearest fiber-bearing ancestor", () => {
  const root = chain([{ type: "div", pendingProps: registryProps("src/Card.tsx:7:3") }]);
  const parent = elementWithFiber(root);
  const child = new FakeElement();
  child.parentElement = parent;
  const result = locateComponentSource(child as any, "screen");
  eq(result?.source, "src/Card.tsx:7:3", "ancestor-resolved source");
});

// ==============================================================================
// R9: the two modes split on "inside the project root" vs "outside it".
//     screen mode = where you'd edit the markup you clicked;
//     implementation mode = the external component that rendered it.
// ==============================================================================
test("R9: external (outside project root) component drives implementation mode only", () => {
  const LibFn = componentFn("Button", "/ext/ui/Button.js:1:1");
  const AppFn = componentFn("App", "/proj/src/App.tsx:2:1");
  const root = chain([
    { type: "button", pendingProps: registryProps("/proj/src/App.tsx:11:5") },
    { type: LibFn, pendingProps: {} },
    { type: AppFn, pendingProps: {} },
  ]);
  eq(
    locateComponentSource(elementWithFiber(root), "screen", "/proj")?.source,
    "src/App.tsx:11:5",
    "screen",
  );
  eq(
    locateComponentSource(elementWithFiber(root), "implementation", "/proj")?.source,
    "/ext/ui/Button.js:1:1",
    "implementation",
  );
});

// --- report -------------------------------------------------------------------
console.log("\n=== react-code-locator runtime tests ===\n");
for (const r of rows) {
  const mark = r.status === "PASS" ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.name}${r.detail ? `\n        -> ${r.detail}` : ""}`);
}
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
