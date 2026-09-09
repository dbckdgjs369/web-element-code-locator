/**
 * End-to-end check in a real browser.
 *
 * verify.mjs exercises each hook in isolation. This one proves they actually connect:
 * a real React render in Chromium, then a DOM element handed to locate() and resolved
 * back to a source position. Nothing here is stubbed.
 */

import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { reactCodeLocator } from "react-code-locator";

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
  server: { port: 5199 },
  plugins: [reactCodeLocator(), react()],
});
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });

console.log("\nEnd-to-end — real render in Chromium");

check("page rendered without errors", pageErrors.length === 0, pageErrors[0]);

check(
  "React actually mounted",
  (await page.locator("#root main").count()) === 1,
);

const locateIn = (selector, mode) =>
  page.evaluate(
    ([sel, m]) => window.__rclLocate(document.querySelector(sel), m),
    [selector, mode],
  );

{
  const result = await locateIn(".panel", "screen");
  check(
    "<section className='panel'> resolves to its JSX call site",
    result?.source === "src/App.tsx:5:10",
    result?.source ?? "no result",
  );
}

{
  const result = await locateIn(".card span", "screen");
  check(
    "nested <span> inside Card resolves",
    result?.source === "src/App.tsx:11:7",
    result?.source ?? "no result",
  );
}

{
  // The client runtime is injected via transformIndexHtml; its overlay elements only
  // appear once armed, but the module itself must have loaded and run.
  const injected = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script[type=module]")).some((s) =>
      s.src.includes("react-code-locator"),
    ),
  );
  check("client runtime script injected into the page", injected);
}

await browser.close();
await server.close();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
