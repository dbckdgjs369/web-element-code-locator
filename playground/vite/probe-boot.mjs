/**
 * Measures what a Vite dev server actually compiles BEFORE any browser request.
 *
 * Boots the server, waits, and never issues a single HTTP request. Anything logged
 * here happened without a browser. Distinguishes two different things that both get
 * loosely called "compiling":
 *
 *   - the transform pipeline (resolveId → load → transform), which is what serves modules
 *   - the dep scanner, which runs esbuild over your source purely to collect bare imports
 */

import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const t0 = Date.now();
const ms = () => String(Date.now() - t0).padStart(5) + "ms";
const events = [];
const record = (kind, detail) => {
  events.push({ kind, detail, at: Date.now() - t0 });
  console.log(`${ms()}  ${kind.padEnd(12)} ${detail}`);
};

const rel = (id) => id.replace(process.cwd() + "/", "").replace(/\?.*$/, "");

const spy = {
  name: "spy",
  enforce: "pre",
  configResolved() {
    record("hook", "configResolved");
  },
  buildStart() {
    record("hook", "buildStart");
  },
  resolveId(id) {
    if (!id.startsWith("\0")) record("resolveId", id);
    return null;
  },
  transform(_code, id) {
    record("transform", rel(id));
    return null;
  },
};

record("start", "createServer()");
const server = await createServer({
  root: process.cwd(),
  logLevel: "warn",
  plugins: [spy, react()],
  server: { port: 5199, host: "127.0.0.1" },
});
record("created", "server object ready");

await server.listen();
record("listen", `http://127.0.0.1:5199 — no request issued from here on`);

// Give the dep optimizer plenty of time to do whatever it does in the background.
await new Promise((r) => setTimeout(r, 4000));
record("waited", "4s elapsed with zero HTTP requests");

const userTransforms = events.filter(
  (e) => e.kind === "transform" && /^(src\/|index\.html)/.test(e.detail),
);

console.log("\n─── 결과 ───");
console.log(`transform 훅 총 호출: ${events.filter((e) => e.kind === "transform").length}`);
console.log(`그중 사용자 소스(src/**): ${userTransforms.length}`);
if (userTransforms.length) console.log(userTransforms.map((e) => "  " + e.detail).join("\n"));

// The scanner's work leaves a trace on disk even though it never touches transform().
// Inspect BEFORE close(): Vite writes the dep bundle into a `deps_temp_*` directory and
// only renames it into place once it commits, and close() cleans temp dirs up.
const fs = await import("node:fs");
const cache = new URL("./node_modules/.vite/", import.meta.url);
try {
  for (const dir of fs.readdirSync(cache)) {
    const files = fs.readdirSync(new URL(dir + "/", cache));
    console.log(`\nnode_modules/.vite/${dir} — ${files.length} files`);
    console.log(files.slice(0, 12).map((f) => "  " + f).join("\n"));
  }
} catch (err) {
  console.log("\nnode_modules/.vite 읽기 실패: " + err.message);
}

await server.close();
