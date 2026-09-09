/**
 * Server components, via React's own owner stacks.
 *
 * A Server Component's `jsxDEV` runs in the Node process, so hook G writes into the
 * server's registry and the browser never sees `__source`. That looked like a dead end.
 * It isn't: React 19 serializes an owner stack for every element it sends over the RSC
 * wire, and the client keeps it on the fiber as `_debugStack`. So the position *is* in
 * the browser — but expressed in the compiled server module's coordinates:
 *
 *   webpack    at ServerPage (about://React/Server/webpack-internal:///(rsc)/./app/page.tsx?6:25:87)
 *   Turbopack  at ServerPanel (about://React/Server/file:///…/.next/server/chunks/ssr/…_.js?4:26:263)
 *
 * Turning that into a source position needs a sourcemap the browser cannot fetch — it
 * belongs to a module that only ever existed on the server. Next solves this for its own
 * error overlay by exposing a mapping service, and that service is reachable from any
 * dev-mode page with a same-origin POST. That is the whole trick. No extension, no CDP.
 *
 * The cost is that this path is asynchronous, which is why it lives apart from `locate()`
 * and why every answer is memoized: hover asks the same question many times a second.
 */

import { NEXT_SOURCEMAP_SERVICE, detectDevServer } from "./dev-server";

export interface OwnerFrame {
  methodName: string;
  file: string;
  line1: number;
  column1: number;
}

/**
 *   at <name> (<file>:<line>:<column>)
 *
 * `about://React/Server/` is React's marker for a frame that ran in another environment,
 * and `?4` is a cache-buster React appends per module instance. Neither belongs in the
 * module URL the mapping service is asked about.
 */
const FRAME_RE = /\s+at (.+?) \((?:about:\/\/React\/[^/]+\/)?(.+?)(?:\?\d+)?:(\d+):(\d+)\)/;

function isInterestingFrame(file: string): boolean {
  if (file.includes("node_modules")) return false;
  // "<anonymous>" and friends — real positions, no file behind them.
  if (file.startsWith("<")) return false;
  return true;
}

type FiberLike = {
  return?: FiberLike | null;
  _debugStack?: { stack?: string } | null;
};

/**
 * The first frame in the stack that belongs to the user's code. React's own plumbing
 * sits above it (`fakeJSXCallSite`) and below it (`react_stack_bottom_frame`), so the
 * frames either side are never the answer.
 */
export function ownerFrameOf(fiber: FiberLike | null): OwnerFrame | null {
  let current: FiberLike | null = fiber;
  // A handful of levels: the element itself, then the components that wrapped it. Past
  // that we are into Next's router internals, whose positions help nobody.
  for (let depth = 0; current && depth < 8; current = current.return ?? null, depth++) {
    const stack = current._debugStack?.stack;
    if (!stack) continue;
    for (const line of stack.split("\n")) {
      const match = FRAME_RE.exec(line);
      if (match && isInterestingFrame(match[2])) {
        return {
          methodName: match[1],
          file: match[2],
          line1: Number(match[3]),
          column1: Number(match[4]),
        };
      }
    }
  }
  return null;
}

const frameKey = (frame: OwnerFrame) => `${frame.file}|${frame.line1}|${frame.column1}`;

/** Resolved answers, including the negative ones — a frame that failed to map will fail again. */
const resolved = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

interface MappedFrame {
  file?: string | null;
  line1?: number | null;
  column1?: number | null;
}

async function askNext(frame: OwnerFrame): Promise<string | null> {
  const response = await fetch(NEXT_SOURCEMAP_SERVICE, {
    method: "POST",
    body: JSON.stringify({
      frames: [{ ...frame, arguments: [] }],
      // App Router puts a component's code in the server compilation, but a client
      // component that rendered during SSR can land in either. Next searches every
      // compilation when isAppDirectory is set, so this covers both.
      isServer: true,
      isEdgeServer: false,
      isAppDirectory: true,
    }),
  });

  // 204 means Next has the endpoint but nothing to say.
  if (!response.ok || response.status === 204) return null;

  const payload = (await response.json()) as
    | Array<{ value?: { originalStackFrame?: MappedFrame | null } }>
    | null;
  const mapped = payload?.[0]?.value?.originalStackFrame;

  // The service answers 200 with the frame echoed back and no line when it could not
  // map it, so a missing line1 — not a bad status — is what "no mapping" looks like.
  if (!mapped?.file || typeof mapped.line1 !== "number") return null;
  return `${mapped.file}:${mapped.line1}:${mapped.column1 ?? 1}`;
}

/**
 * The answer if it has already been fetched. Lets the synchronous hover path paint
 * immediately on the second look at an element without duplicating the resolution logic.
 */
export function peekOwnerSource(fiber: FiberLike | null): string | null | undefined {
  const frame = ownerFrameOf(fiber);
  if (!frame) return null;
  return resolved.get(frameKey(frame));
}

/** DOM fiber -> source position, going through the dev server's sourcemap service. */
export async function resolveOwnerSource(fiber: FiberLike | null): Promise<string | null> {
  if (detectDevServer() !== "next") return null;

  const frame = ownerFrameOf(fiber);
  if (!frame) return null;

  const key = frameKey(frame);
  if (resolved.has(key)) return resolved.get(key) ?? null;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = askNext(frame)
    .catch(() => null)
    .then((source) => {
      resolved.set(key, source);
      inFlight.delete(key);
      return source;
    });

  inFlight.set(key, request);
  return request;
}
