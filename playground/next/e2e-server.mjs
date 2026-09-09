/**
 * Server components, end to end, in a real browser against a real `next dev`.
 *
 * e2e.mjs covers client components, where hook G's registry answers synchronously.
 * Nothing there exercises the App Router *default*, which is a server component whose
 * jsxDEV ran in another process. This one does, through the owner-stack path in src/rsc.
 *
 * It also asserts the two things that make that path usable rather than merely correct:
 * the sync call must still return null (so the fallback is genuinely being tested), and
 * the editor endpoint must exist (v1's defining bug was a 404 nobody could see).
 *
 *   node e2e-server.mjs           webpack
 *   node e2e-server.mjs --turbo   Turbopack
 */

import { spawn } from "node:child_process";
import { chromium } from "../vite/node_modules/playwright/index.mjs";

const turbo = process.argv.includes("--turbo");
const port = turbo ? 5332 : 5331;
const root = import.meta.dirname;

// Hand-read from app/server/page.tsx.
const EXPECTED = [
  [".server-main", "app/server/page.tsx:13:5", "<main> inside ServerPage()"],
  [".server-panel", "app/server/page.tsx:8:10", "<section> inside ServerPanel()"],
  [".server-text", "app/server/page.tsx:15:7", "<p> inside ServerPage()"],
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
  const timer = setTimeout(() => reject(new Error("dev server did not become ready")), 120_000);
  const poll = setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${port}/server`);
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

let browser;
try {
  await waitForReady;

  browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`http://localhost:${port}/server`, { waitUntil: "networkidle" });

  console.log(`\nNext dev (${turbo ? "Turbopack" : "webpack"}) — server components\n`);

  check("page rendered with no uncaught errors", pageErrors.length === 0, pageErrors[0]);
  check(
    "React hydrated",
    await page.evaluate(() =>
      Object.keys(document.body).some((k) => k.startsWith("__reactFiber$")),
    ),
  );
  check(
    "client runtime mounted",
    await page.evaluate(() => typeof window.__rclLocateAsync === "function"),
  );
  check(
    "dev server detected as next",
    (await page.evaluate(() => window.__rclDetect?.() ?? "n/a")) !== "vite",
  );

  for (const [selector, expected, note] of EXPECTED) {
    const got = await page.evaluate(async ([sel]) => {
      const el = document.querySelector(sel);
      if (!el) return { error: "no such element" };
      return {
        sync: window.__rclLocate(el, "screen")?.source ?? null,
        async: (await window.__rclLocateAsync(el, "screen"))?.source ?? null,
        viaOwnerStack: (await window.__rclLocateAsync(el, "screen"))?.viaOwnerStack ?? false,
      };
    }, [selector]);

    check(`${selector.padEnd(15)} -> ${expected}`, got.async === expected, `got ${got.async} · ${note}`);
    // If the sync path answered, the registry had it and this test proved nothing about
    // the owner-stack path — which would mean the page is not a server component.
    check(`${selector.padEnd(15)} came from the owner stack`, got.sync === null && got.viaOwnerStack);
  }

  // The second lookup must not re-fetch, or hover would issue a request per frame.
  const cachedSync = await page.evaluate(
    () => window.__rclLocate(document.querySelector(".server-main"), "screen")?.source ?? null,
  );
  check("resolved position is cached for the sync path", cachedSync === EXPECTED[0][1], `got ${cachedSync}`);

  // Deliberately no `file` parameter. This endpoint does not report on the editor —
  // it *launches* it, and $EDITOR being vi means a passing test would spawn a vi per run
  // (it did: five of them). Next checks `if (!frame.file) return badRequest(res)` before
  // opening anything, so 400 proves the route is mounted and 404 proves it is not,
  // without touching the user's editor.
  const editorStatus = await page.evaluate(async () => {
    const res = await fetch("/__nextjs_launch-editor");
    return res.status;
  });
  check("editor endpoint is mounted", editorStatus === 400, `HTTP ${editorStatus}`);

  if (pageErrors.length) {
    console.log("\n  page errors:");
    pageErrors.forEach((e) => console.log("   " + e));
  }
} catch (err) {
  fail++;
  console.log(`  FAIL  harness — ${err.message}`);
  console.log("\n  dev server output:\n" + serverLog.join("").split("\n").slice(-25).join("\n"));
}

if (browser) await browser.close();
server.kill("SIGTERM");
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
