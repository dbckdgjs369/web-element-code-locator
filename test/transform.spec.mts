/**
 * Transform-level regression tests for react-code-locator.
 *
 * These feed source fixtures directly into `transformSource` and assert whether
 * the source-location metadata actually gets injected.
 *
 * Two kinds of metadata:
 *   1. JSX-level:       every JSXElement is wrapped in `__rcl(<el/>, "file:line:col")`,
 *                       which registers the source in a global WeakMap keyed by the
 *                       element's props object. Nothing is added to props themselves.
 *   2. Component-level: `Name.__componentSourceLoc = "file:line:col"` on component decls
 *
 * Run:  npm run test:transform
 */
import { transformSource } from "../src/core/transform.ts";
import { parse as babelParse } from "@babel/parser";

const ROOT = "/proj";

type Assert = (out: string) => void;

let passed = 0;
let failed = 0;
const rows: Array<{ status: string; name: string; detail?: string }> = [];

// The parser config here must mirror src/core/transform.ts. If it drifts, tests
// using newer syntax fail in the re-parse step rather than in the transform.
const VERIFY_PLUGINS = [
  "typescript",
  "jsx",
  "explicitResourceManagement",
  "importAttributes",
  "decorators-legacy",
  "decoratorAutoAccessors",
] as const;

// Guard: the transformed output must still be valid, parseable TSX — otherwise
// we'd be silently corrupting users' source and breaking their builds.
function assertParses(out: string) {
  try {
    babelParse(out, {
      sourceType: "module",
      plugins: [...VERIFY_PLUGINS] as any,
    });
  } catch (e) {
    throw new Error(`transformed output does not parse: ${(e as Error).message}`);
  }
}

function run(name: string, code: string, filename: string, assert: Assert) {
  const result = transformSource(code, { filename, projectRoot: ROOT });
  // transformSource returns null when NOTHING was injected.
  const out = result?.code ?? code;
  try {
    assertParses(out);
    assert(out);
    rows.push({ status: "PASS", name });
    passed++;
  } catch (e) {
    rows.push({ status: "FAIL", name, detail: (e as Error).message });
    failed++;
  }
}

function check(name: string, fn: () => void) {
  try {
    fn();
    rows.push({ status: "PASS", name });
    passed++;
  } catch (e) {
    rows.push({ status: "FAIL", name, detail: (e as Error).message });
    failed++;
  }
}

// ---- assertion helpers -----------------------------------------------------
function hasComponentSource(out: string, name: string) {
  if (!out.includes(`${name}.__componentSourceLoc`)) {
    throw new Error(`expected component-source injection for "${name}", got none`);
  }
}
function lacksComponentSource(out: string, name: string) {
  if (out.includes(`${name}.__componentSourceLoc`)) {
    throw new Error(`expected NO component-source injection for "${name}", but found one`);
  }
}
// `__rcl(` immediately followed by `<` is always a JSX wrap; the helper
// declaration (`function __rcl(e,s)`) never matches.
function jsxCount(out: string) {
  return (out.match(/__rcl\(</g) ?? []).length;
}
function hasJsx(out: string, atLeast = 1) {
  const n = jsxCount(out);
  if (n < atLeast) throw new Error(`expected >=${atLeast} JSX injections, got ${n}`);
}
function hasRegistryHelper(out: string) {
  if (!out.includes("react-code-locator.jsxSourceRegistry")) {
    throw new Error("expected the WeakMap registry helper to be injected");
  }
}

// ===========================================================================
// BASELINE
// ===========================================================================
run(
  "baseline: function component gets component-source",
  `export function App() { return <div>hi</div>; }`,
  "App.tsx",
  (out) => hasComponentSource(out, "App"),
);

run(
  "baseline: every JSX element is wrapped in __rcl()",
  `export function App() { return <div><span>hi</span></div>; }`,
  "App.tsx",
  (out) => {
    hasJsx(out, 2);
    hasRegistryHelper(out);
  },
);

run(
  "baseline: JSX source is NOT written into props (no prop pollution)",
  `export function App() { return <div><span>hi</span></div>; }`,
  "App.tsx",
  (out) => {
    if (out.includes("$componentSourceLoc=")) {
      throw new Error("JSX source leaked into props as a JSX attribute");
    }
  },
);

run(
  "baseline: nested JSX children are wrapped in an expression container",
  `export function App() { return <div><span>hi</span></div>; }`,
  "App.tsx",
  (out) => {
    // Without `{...}` the literal text `__rcl(` would render as a DOM text node.
    if (!out.includes("{__rcl(<span>")) {
      throw new Error("child JSX element was not wrapped in {} — would render as text");
    }
  },
);

run(
  "baseline: arrow function component gets component-source",
  `export const Card = () => <div>card</div>;`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

run(
  "baseline: memo() wrapped component",
  `import { memo } from "react";
export const Card = memo(function Card() { return <div>card</div>; });`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

run(
  "baseline: React.forwardRef() wrapped component",
  `import React from "react";
export const Field = React.forwardRef(function Field() { return <input />; });`,
  "Field.tsx",
  (out) => hasComponentSource(out, "Field"),
);

run(
  "baseline: lowercase identifiers are not treated as components",
  `export const helper = () => 1;
export function App() { return <div>hi</div>; }`,
  "App.tsx",
  (out) => {
    lacksComponentSource(out, "helper");
    hasComponentSource(out, "App");
  },
);

run(
  "baseline: .ts file gets component-source but no JSX wrapping",
  `export function useThing() { return 1; }
export const Store = () => ({ a: 1 });`,
  "store.ts",
  (out) => {
    hasComponentSource(out, "Store");
    if (jsxCount(out) !== 0) throw new Error("JSX injection ran on a .ts file");
  },
);

// ===========================================================================
// S: modern TS syntax the parser must not choke on
//
// A parse failure skips the WHOLE file silently, so one unsupported operator
// anywhere disables the tool for every component in that file. These lock in
// the syntax coverage that motivated moving off acorn-typescript.
// ===========================================================================

// S1: `satisfies` (TS 4.9)
run(
  "S1: satisfies operator does not disable the file",
  `const cfg = { a: 1 } satisfies Record<string, number>;
export function Card() { return <div>{cfg.a}</div>; }`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

// S2: const type parameters (TS 5.0)
run(
  "S2: const type parameter does not disable the file",
  `export function Card<const T extends string>(p: { v: T }) { return <div>{p.v}</div>; }`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

// S3: `using` declarations (TS 5.2)
run(
  "S3: using declaration does not disable the file",
  `export function Card() { return <div>ok</div>; }
using res = null;`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

// S4: legacy decorators — what TS `experimentalDecorators` emits
run(
  "S4: decorated class does not disable the file",
  `@observer
class Card extends Component { render() { return <div>ok</div>; } }
export function Wrapper() { return <Card />; }`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Wrapper"),
);

// S5: `accessor` auto-accessors (stage-3 decorators)
run(
  "S5: accessor field does not disable the file",
  `class Store { accessor n = 1; }
export function Card() { return <div>ok</div>; }`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

// S6: import attributes
run(
  "S6: import attributes do not disable the file",
  `import data from "./d.json" with { type: "json" };
export function Card() { return <div>{data}</div>; }`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

// S7: generic arrow functions in .tsx — historically a known gap
run(
  "S7: <T,> generic arrow in .tsx does not disable the file",
  `const identity = <T,>(v: T) => v;
export function Card() { return <div>{identity(1)}</div>; }`,
  "Card.tsx",
  (out) => hasComponentSource(out, "Card"),
);

// S8: a genuinely broken file must return null rather than emit garbage
check("S8: unparseable file is skipped, not corrupted", () => {
  const result = transformSource("const a = (((;", { filename: "Broken.tsx", projectRoot: ROOT });
  if (result !== null) throw new Error("expected null for unparseable source");
});

// S9: parse failures warn exactly once per file (silent skips are the bug we fixed)
check("S9: parse failure warns once per file", () => {
  const original = console.warn;
  let warnings = 0;
  console.warn = () => {
    warnings++;
  };
  try {
    const filename = `Broken-${Math.random()}.tsx`;
    transformSource("const a = (((;", { filename, projectRoot: ROOT });
    transformSource("const a = (((;", { filename, projectRoot: ROOT });
  } finally {
    console.warn = original;
  }
  if (warnings !== 1) throw new Error(`expected exactly 1 warning, got ${warnings}`);
});

// ---- report ---------------------------------------------------------------
console.log("\n=== react-code-locator transform tests ===\n");
for (const r of rows) {
  const mark = r.status === "PASS" ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.name}${r.detail ? `\n        -> ${r.detail}` : ""}`);
}
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
