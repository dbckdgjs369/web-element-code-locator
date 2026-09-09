/**
 * DOM element -> source location.
 *
 * Walks up the fiber tree collecting two independent kinds of candidate:
 *
 *   JSX call sites      — from the registry (hook G), or from `fiber._debugSource`
 *                         on React 18 and below, which is free when it's there.
 *   component definitions — from the property the Babel hook (D) stamped on the
 *                         component function itself.
 *
 * The two modes answer different questions. "screen" answers *where was this used*,
 * which is what someone clicking a button on screen almost always wants. "implementation"
 * answers *where does this component live*, which is what you want for a design-system
 * component whose usage site tells you nothing.
 *
 * Neither kind of candidate exists for a Server Component — its `jsxDEV` ran in another
 * process. Those go through `locateAsync`, which falls back to React's owner stacks; see
 * ./rsc. `locate` stays synchronous because hover calls it once per animation frame.
 */

import { getRegistry, COMPONENT_SOURCE_PROP, type SourceLocation } from "./registry";
import { formatLocation, getSourceFile, isProjectLocalSource } from "./paths";
import { peekOwnerSource, resolveOwnerSource } from "./rsc";

export type LocatorMode = "screen" | "implementation";

export interface LocatorResult {
  source: string;
  mode: LocatorMode;
  /**
   * True when the requested mode had nothing of its own and this is the other mode's
   * answer. Alt+2 hits this constantly outside Vite, and silently showing Alt+1's
   * result as if it were the implementation site is how the docs came to be wrong.
   */
  fallback?: boolean;
  /** Set when the answer came from the owner-stack path rather than the registry. */
  viaOwnerStack?: boolean;
}

type Fiber = {
  return?: Fiber | null;
  type?: unknown;
  elementType?: unknown;
  pendingProps?: Record<string, unknown> | null;
  memoizedProps?: Record<string, unknown> | null;
  _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number } | null;
  _debugStack?: { stack?: string } | null;
};

const fiberKeyCache = new WeakMap<Element, string | undefined>();

function getFiberKey(element: Element): string | undefined {
  if (fiberKeyCache.has(element)) return fiberKeyCache.get(element);
  const key = Object.keys(element).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  fiberKeyCache.set(element, key);
  return key;
}

function getClosestFiber(target: Element | null): Fiber | null {
  let current = target;
  while (current) {
    const key = getFiberKey(current);
    if (key) return (current as unknown as Record<string, unknown>)[key] as Fiber;
    current = current.parentElement;
  }
  return null;
}

/** Hook G's payload, plus the React <=18 fallback. */
function jsxSourceOf(fiber: Fiber, projectRoot?: string): string | null {
  const registry = getRegistry();
  for (const props of [fiber.pendingProps, fiber.memoizedProps]) {
    if (props && typeof props === "object") {
      const loc = registry.get(props as object);
      if (loc) return formatLocation(loc, projectRoot);
    }
  }

  const debugSource = fiber._debugSource;
  if (debugSource?.fileName && typeof debugSource.lineNumber === "number") {
    const loc: SourceLocation = {
      file: debugSource.fileName,
      line: debugSource.lineNumber,
      column: debugSource.columnNumber ?? 1,
    };
    return formatLocation(loc, projectRoot);
  }

  return null;
}

/** Hook D's payload. Unwraps memo/forwardRef, which hold the real component inside. */
function componentSourceOf(fiber: Fiber): string | null {
  for (const candidate of [fiber.type, fiber.elementType]) {
    if (!candidate) continue;

    if (typeof candidate === "function") {
      const value = (candidate as unknown as Record<string, unknown>)[COMPONENT_SOURCE_PROP];
      if (typeof value === "string") return value;
      continue;
    }

    if (typeof candidate === "object") {
      const record = candidate as {
        type?: Record<string, unknown>;
        render?: Record<string, unknown>;
        [key: string]: unknown;
      };
      const value =
        record[COMPONENT_SOURCE_PROP] ??
        record.type?.[COMPONENT_SOURCE_PROP] ??
        record.render?.[COMPONENT_SOURCE_PROP];
      if (typeof value === "string") return value;
    }
  }
  return null;
}

interface Candidate {
  source: string;
  file: string;
}

function collect(fiber: Fiber | null, projectRoot?: string) {
  const jsx: Candidate[] = [];
  const component: Candidate[] = [];
  const seenJsx = new Set<string>();
  const seenComponent = new Set<string>();

  let current: Fiber | null = fiber;
  while (current) {
    const jsxSource = jsxSourceOf(current, projectRoot);
    if (jsxSource && !seenJsx.has(jsxSource)) {
      const file = getSourceFile(jsxSource);
      if (file) {
        seenJsx.add(jsxSource);
        jsx.push({ source: jsxSource, file });
      }
    }

    const componentSource = componentSourceOf(current);
    if (componentSource && !seenComponent.has(componentSource)) {
      const file = getSourceFile(componentSource);
      if (file) {
        seenComponent.add(componentSource);
        component.push({ source: componentSource, file });
      }
    }

    current = current.return ?? null;
  }

  return { jsx, component };
}

function resolve(fiber: Fiber | null, projectRoot?: string) {
  const { jsx, component } = collect(fiber, projectRoot);

  const localJsx = jsx.filter((c) => isProjectLocalSource(c.source));
  const localComponent = component.filter((c) => isProjectLocalSource(c.source));

  let screen: string | null = null;
  const nearestLocalComponentFile = localComponent[0]?.file;

  if (nearestLocalComponentFile) {
    // Common case: the component and the JSX that used it live in the same file.
    const sameFile = jsx.find((c) => c.file === nearestLocalComponentFile);
    if (sameFile) {
      screen = sameFile.source;
    } else if (localJsx[0]) {
      // The definition file contains no JSX — the classic shape is styled-components
      // collected into a styled.tsx. Jumping to styled.tsx:4 does not answer "where is
      // this on screen", so prefer the nearest actual usage instead.
      screen = localJsx[0].source;
    } else {
      screen = localComponent.find((c) => c.file === nearestLocalComponentFile)?.source ?? null;
    }
  }

  screen = screen ?? localJsx[0]?.source ?? localComponent[0]?.source ?? null;

  // The nearest definition site walking up *is* the component that rendered this
  // element — that is the question Alt+2 asks. An earlier version filtered these down
  // to non-project-local candidates, which conflated "the implementation" with "in a
  // dependency" and meant Alt+2 never surfaced anything the Babel hook had stamped.
  const implementation = component[0]?.source ?? null;

  return { screen, implementation };
}

function pick(
  candidates: { screen: string | null; implementation: string | null },
  mode: LocatorMode,
): LocatorResult | null {
  const wanted = candidates[mode];
  if (wanted) return { source: wanted, mode };

  const other = mode === "screen" ? candidates.implementation : candidates.screen;
  return other ? { source: other, mode, fallback: true } : null;
}

export function locate(
  target: EventTarget | null,
  mode: LocatorMode = "screen",
  projectRoot?: string,
): LocatorResult | null {
  const element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;

  const fiber = getClosestFiber(element);
  if (!fiber) return null;

  const direct = pick(resolve(fiber, projectRoot), mode);
  if (direct) return direct;

  // Already-resolved owner stacks are free to read, so a second hover over a server
  // component paints in the same frame as any other element.
  const peeked = peekOwnerSource(fiber);
  return peeked ? { source: peeked, mode, viaOwnerStack: true } : null;
}

/**
 * `locate`, plus the one path that cannot be synchronous. Callers that can tolerate a
 * round trip — a click, a context menu, a hover that repaints when the answer lands —
 * should use this; it is the only way a Server Component ever resolves.
 */
export async function locateAsync(
  target: EventTarget | null,
  mode: LocatorMode = "screen",
  projectRoot?: string,
): Promise<LocatorResult | null> {
  const sync = locate(target, mode, projectRoot);
  if (sync) return sync;

  const element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const fiber = getClosestFiber(element);
  if (!fiber) return null;

  const source = await resolveOwnerSource(fiber);
  return source ? { source, mode, viaOwnerStack: true } : null;
}
