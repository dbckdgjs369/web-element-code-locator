/**
 * Gate check for Next.js.
 *
 * Isolates the compiled module for app/page.tsx out of the dev bundle and reports exactly
 * what the compiler emitted for it. Everything else in the bundle (React's own dev runtime,
 * its inlined sourcesContent) contains the words we're grepping for, so a whole-bundle
 * search gives false positives — hence the narrow slice.
 *
 *   node check.mjs           # webpack
 *   node check.mjs --turbo   # Turbopack
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const turbo = process.argv.includes("--turbo");
const port = turbo ? 3101 : 3100;
const label = turbo ? "Turbopack" : "webpack";

const server = spawn(
  "npx",
  ["next", "dev", "--port", String(port), ...(turbo ? ["--turbopack"] : [])],
  { cwd: import.meta.dirname, stdio: ["ignore", "pipe", "pipe"] },
);
const log = [];
server.stdout.on("data", (d) => log.push(String(d)));
server.stderr.on("data", (d) => log.push(String(d)));

async function waitForReady(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) return await res.text();
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`next dev (${label}) never became ready:\n${log.join("")}`);
}

try {
  const html = await waitForReady();

  const srcs = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
  const chunks = await Promise.all(
    srcs.map(async (src) => {
      const url = src.startsWith("http") ? src : `http://localhost:${port}${src}`;
      const res = await fetch(url).catch(() => null);
      return res?.ok ? res.text() : "";
    }),
  );
  const bundle = chunks.join("\n");

  console.log(`\nNext.js dev — ${label} mode`);

  // Find the compiled module for app/page.tsx and take a window around it.
  const anchor = bundle.search(/app[\\/]page\.tsx/);
  if (anchor === -1) {
    console.log("  could not locate the compiled app/page.tsx module in the bundle");
  } else {
    const slice = bundle.slice(Math.max(0, anchor - 2000), anchor + 3000);

    const jsxCalls = [...slice.matchAll(/jsxDEV\)?\s*\(/g)].length;
    console.log(`  jsxDEV call sites in the page module: ${jsxCalls}`);

    const sourceObjects = [
      ...slice.matchAll(/fileName\s*:\s*\\?"([^"\\]+)\\?"\s*,\s*lineNumber\s*:\s*(\d+)\s*,\s*columnNumber\s*:\s*(\d+)/g),
    ];
    if (sourceObjects.length === 0) {
      console.log("  __source payloads: NONE — the compiler emitted no location data");
    } else {
      console.log(
        `  __source payloads: ${sourceObjects
          .map((m) => `${m[1].split("/").pop()}:${m[2]}:${m[3]}`)
          .join(", ")}`,
      );
    }

    // What specifier does the page module import the JSX runtime under? This decides how
    // hook C has to intercept here, since Next serves its own vendored React.
    const specifiers = [
      ...new Set([...slice.matchAll(/\\?["']([^"'\\]*jsx-dev-runtime)\\?["']/g)].map((m) => m[1])),
    ];
    console.log(`  JSX runtime specifier: ${specifiers.join(", ") || "not found in slice"}`);

    // Hook C — did our wrapper actually get into the graph?
    const wrapped = /react-code-locator/.test(bundle) && /wrapJsxDevRuntime|__rcl/.test(bundle);
    console.log(`  our jsx-dev-runtime shim present in bundle: ${wrapped ? "YES" : "NO"}`);

    // Print one jsxDEV call verbatim so the argument count is visible.
    const sample = slice.match(/jsxDEV\)?\s*\([\s\S]{0,240}/);
    if (sample) {
      console.log("\n  sample call:");
      console.log(
        sample[0]
          .split("\n")
          .slice(0, 10)
          .map((l) => `    ${l}`)
          .join("\n"),
      );
    }
  }
} catch (error) {
  console.error(String(error).slice(0, 2000));
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
