/**
 * Headless gate check against a real Vite dev server.
 *
 * Each hook is exercised on the path it actually runs on:
 *   C — inspect the browser-targeted transform output and see where the JSX runtime
 *       import was pointed. This is the client pipeline, not SSR.
 *   G — call the built wrapper directly with a synthetic __source payload.
 *   D — execute the module and read the stamps the Babel visitor left behind.
 *
 * SSR is used only for D, with Vite's default externalization left intact: forcing
 * `noExternal` drags React's CJS jsx-dev-runtime into the SSR runner and it explodes on
 * `module is not defined`. That's a harness artifact, not a product bug — in the browser
 * Vite pre-bundles React to ESM first.
 */

import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import {
  reactCodeLocator,
  getRegistry,
  COMPONENT_SOURCE_PROP,
} from "react-code-locator";
import { jsxDEV } from "react-code-locator/jsx-dev-runtime";

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const server = await createServer({
  configFile: false,
  root: import.meta.dirname,
  logLevel: "error",
  // No `babel: { plugins: [...] }` here on purpose. The Babel visitor should reach
  // plugin-react on its own, through the api.reactBabel extension point.
  plugins: [reactCodeLocator(), react()],
});
await server.pluginContainer.buildStart({});

console.log("\nHook C — react/jsx-dev-runtime redirected to our wrapper");
{
  const resolved = await server.pluginContainer.resolveId(
    "react/jsx-dev-runtime",
    "/src/App.tsx",
  );
  check(
    "bare specifier resolves into this package",
    // Name-agnostic: a file: install resolves through the symlink to the real checkout,
    // whose directory name is not the package name. "our wrapper" = dist/jsx-dev-runtime.
    Boolean(resolved?.id && /[\\/]dist[\\/]jsx-dev-runtime\.js/.test(resolved.id)),
    resolved?.id ?? "unresolved",
  );

  // The cycle-breaker: our own wrapper must still reach the real React runtime.
  const fromSelf = await server.pluginContainer.resolveId(
    "react/jsx-dev-runtime",
    "/Users/x/node_modules/react-code-locator/dist/jsx-dev-runtime.js",
  );
  // Assert it landed on React itself. Do not test this by pattern-excluding our package
  // name — the checkout directory is itself called react-code-locator-v2, so a loose
  // regex matches the correct answer too.
  check(
    "our wrapper's own import reaches real React (no cycle)",
    /[\\/]node_modules[\\/]react[\\/]jsx-dev-runtime/.test(fromSelf?.id ?? ""),
    fromSelf?.id ?? "unresolved",
  );
}

console.log("\nHook G — __source captured before React discards it");
{
  const element = jsxDEV(
    "div",
    { children: "hi" },
    undefined,
    false,
    { fileName: "src/App.tsx", lineNumber: 42, columnNumber: 7 },
    undefined,
  );
  const loc = getRegistry().get(element.props);
  check(
    "location recorded on the created element",
    loc?.file === "src/App.tsx" && loc.line === 42 && loc.column === 7,
    loc ? `${loc.file}:${loc.line}:${loc.column}` : "registry miss",
  );

  // Elements built outside JSX carry no source; this must degrade quietly.
  const bare = jsxDEV("div", { children: "hi" }, undefined, false, undefined, undefined);
  check("element without __source does not throw", !getRegistry().has(bare.props));
}

console.log("\nHook D — component definition sites stamped by the Babel visitor");
{
  const mod = await server.ssrLoadModule("/src/App.tsx");
  for (const [name, value] of [
    ["Panel (function declaration)", mod.Panel],
    ["Card (memo-wrapped)", mod.Card],
    ["App (export default function)", mod.default],
  ]) {
    const loc = value?.[COMPONENT_SOURCE_PROP];
    check(name, typeof loc === "string", loc ?? "not stamped");
  }
}

await server.close();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
