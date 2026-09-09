/**
 * Which dev server are we running under, and what does it expose?
 *
 * The two things that differ are the editor endpoint and whether a sourcemap service
 * exists. Vite has `/__open-in-editor` because this package installs it; Next has
 * `/__nextjs_launch-editor` and `/__nextjs_original-stack-frames` of its own, which its
 * error overlay already relies on. Guessing wrong is not harmless: the failed fetch is
 * swallowed and the user sees nothing happen, which is the worst possible failure mode.
 *
 * Browser-only. Nothing here touches Node.
 */

export type DevServerKind = "vite" | "next" | "unknown";

/** Must stay in step with the constant in ./open-in-editor, which Node code owns. */
const VITE_OPEN_IN_EDITOR = "/__open-in-editor";
const NEXT_LAUNCH_EDITOR = "/__nextjs_launch-editor";
export const NEXT_SOURCEMAP_SERVICE = "/__nextjs_original-stack-frames";

let cached: DevServerKind | null = null;

export function detectDevServer(): DevServerKind {
  if (cached) return cached;
  if (typeof document === "undefined") return "unknown";

  const global = globalThis as Record<string, unknown>;

  // __next_f is the RSC payload sink and exists on every App Router page; __NEXT_DATA__
  // covers the Pages Router. The script probe is the backstop for either.
  const isNext =
    global.__next_f !== undefined ||
    global.__NEXT_DATA__ !== undefined ||
    !!document.querySelector('script[src^="/_next/"]');
  if (isNext) return (cached = "next");

  // Vite injects this into the page it serves; our own client is loaded the same way.
  const isVite = global.__vite_plugin_react_preamble_installed__ !== undefined;
  if (isVite) return (cached = "vite");

  return "unknown";
}

/**
 * Where to send a `file:line:column` so the user's editor opens it, or null when the
 * dev server has no such endpoint and the caller should say so instead of firing a
 * request into the void.
 */
export function editorRequestFor(source: string): { url: string } | null {
  const match = /^(.*):(\d+):(\d+)$/.exec(source);
  const file = match?.[1] ?? source;
  const line = match?.[2] ?? "1";
  const column = match?.[3] ?? "1";

  switch (detectDevServer()) {
    case "next":
      // Next reads file/line1/column1 — see middleware-webpack.js. Its own overlay
      // sends 1-based values, which is what our `source` strings already carry.
      return {
        url: `${NEXT_LAUNCH_EDITOR}?file=${encodeURIComponent(file)}&line1=${line}&column1=${column}`,
      };
    case "vite":
      return { url: `${VITE_OPEN_IN_EDITOR}?file=${encodeURIComponent(source)}` };
    default:
      return null;
  }
}
