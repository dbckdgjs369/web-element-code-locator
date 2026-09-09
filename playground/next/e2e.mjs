/**
 * End-to-end check in a real browser, against a real `next dev`.
 *
 * check.mjs proves the *data* is right by reading __source payloads out of the bundle.
 * This one proves the whole chain actually runs: hydration → our wrapped jsxDEV writing to
 * the registry → fiber lookup from a DOM node → a source position. Nothing is stubbed.
 *
 *   node e2e.mjs           webpack
 *   node e2e.mjs --turbo   Turbopack
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "../vite/node_modules/playwright/index.mjs";

const turbo = process.argv.includes("--turbo");
const port = turbo ? 5322 : 5321;
const root = import.meta.dirname;

// Hand-read from app/page.tsx. Columns are asserted too — check.mjs already measured them.
const EXPECTED = [
  [".panel", "app/page.tsx:7:10", "<section className='panel'> inside Panel()"],
  [".card", "app/page.tsx:12:5", "<div className='card'> inside CardImpl"],
  [".card span", "app/page.tsx:13:7", "<span>nested</span>"],
  ["main", "app/page.tsx:20:5", "<main> inside Page()"],
];

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const args = ["next", "dev", "--port", String(port)];
if (turbo) args.push("--turbopack");

const server = spawn("npx", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
const serverLog = [];
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => serverLog.push(chunk.toString()));
}

const waitForReady = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("dev server did not become ready")), 90_000);
  const poll = setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve();
      }
    } catch {
      /* not up yet */
    }
  }, 1000);
});

const finish = async (browser) => {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};

let browser;
try {
  await waitForReady;

  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });

  console.log(`\nNext dev (${turbo ? "Turbopack" : "webpack"}) — real render in Chromium\n`);

  check("page rendered with no uncaught errors", pageErrors.length === 0, pageErrors[0]);

  // Without this, everything below fails for a reason that has nothing to do with us —
  // worth asserting separately so the failure is legible.
  const hydrated = await page.evaluate(() =>
    Object.keys(document.body).some((k) => k.startsWith("__reactFiber$")),
  );
  check("React hydrated (fiber keys on document.body)", hydrated);

  check(
    "client runtime mounted",
    await page.evaluate(() => typeof window.__rclLocate === "function"),
  );

  const registry = await page.evaluate(() => {
    const reg = globalThis[Symbol.for("react-code-locator.registry")];
    return reg ? reg.constructor.name : "absent";
  });
  check("registry present on globalThis", registry === "WeakMap", registry);

  for (const [selector, expected, note] of EXPECTED) {
    const got = await page.evaluate(([sel]) => {
      const el = document.querySelector(sel);
      if (!el) return "no such element";
      return window.__rclLocate(el, "screen")?.source ?? "null";
    }, [selector]);
    check(`${selector.padEnd(12)} → ${expected}`, got === expected, `got ${got} · ${note}`);
  }

  if (pageErrors.length) {
    console.log("\n  page errors:");
    pageErrors.forEach((e) => console.log("   " + e));
  }
} catch (err) {
  fail++;
  console.log(`  FAIL  harness — ${err.message}`);
  console.log("\n  dev server output:\n" + serverLog.join("").split("\n").slice(-25).join("\n"));
}

await finish(browser);
