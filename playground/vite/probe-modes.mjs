/**
 * Compares what "screen" (Alt+1) and "implementation" (Alt+2) actually return.
 *
 * Reading resolve() in src/locate.ts, `implementation` picks the first candidate that is
 * NOT project-local — i.e. a component that lives in node_modules — and falls back to
 * `screen` when there is none. So for an all-local component tree the two modes should be
 * identical. This measures whether that is true instead of trusting the README.
 */

import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { reactCodeLocator } from "react-code-locator";

const server = await createServer({
  configFile: false,
  root: import.meta.dirname,
  logLevel: "error",
  server: { port: 5201 },
  plugins: [reactCodeLocator(), react()],
});
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  pageerror:", String(e)));
await page.goto("http://localhost:5201/", { waitUntil: "networkidle" });

const targets = [
  [".panel", "<section className='panel'>  — Panel() 정의 4행, JSX 5행"],
  [".card span", "<span>nested</span>       — CardImpl 정의 8행, JSX 11행"],
  ["main", "<main>                    — App() 정의 18행, JSX 20행"],
];

console.log("\nselector          Alt+1 (screen)        Alt+2 (implementation)   같은가");
console.log("─".repeat(78));

for (const [selector, note] of targets) {
  const [screen, impl] = await page.evaluate(([sel]) => {
    const el = document.querySelector(sel);
    return [
      window.__rclLocate(el, "screen")?.source ?? "null",
      window.__rclLocate(el, "implementation")?.source ?? "null",
    ];
  }, [selector]);

  const same = screen === impl ? "예" : "아니오";
  console.log(
    `${selector.padEnd(17)} ${screen.padEnd(21)} ${impl.padEnd(24)} ${same}`,
  );
  console.log(`${" ".repeat(18)}${note}`);
}

await browser.close();
await server.close();
