/**
 * Shared assertion half of the bundler smoke tests.
 *
 * Each verify-<bundler>.mjs builds src/app.jsx to a CJS bundle with react external and
 * the react-code-locator integration active, then hands the output file here. This loads
 * it in-process, renders nothing — it just *creates* the elements by calling App() — and
 * asserts that the registry saw both host elements at their exact source positions.
 *
 * That is the entire contract of a hook-C integration: jsxDEV ran, the wrapper was in
 * front of it, and the recorded path came out project-relative (the baked projectRoot).
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Hand-read from src/app.jsx.
const EXPECTED = [
  ["<div>", (app) => app.props, "src/app.jsx:5:5"],
  ["<button>", (app) => app.props.children.props, "src/app.jsx:6:7"],
];

export function checkBundle(name, outfile) {
  // The bundle carries its own copy of the wrapper (via the shim), but the registry lives
  // on globalThis under Symbol.for, so this copy and the bundle's converge on one map.
  const { getRegistry } = require("react-code-locator");
  const registry = getRegistry();

  const { App } = require(outfile);
  const app = App();

  let pass = 0;
  let fail = 0;
  console.log(`\n${name}\n`);

  for (const [label, pick, expected] of EXPECTED) {
    let got = null;
    try {
      const loc = registry.get(pick(app));
      got = loc ? `${loc.file}:${loc.line}:${loc.column}` : null;
    } catch (err) {
      got = `threw: ${err.message}`;
    }
    const ok = got === expected;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(10)} -> ${expected}${ok ? "" : ` — got ${got}`}`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
