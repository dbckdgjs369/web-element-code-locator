/**
 * The single source of truth shared between the build-time hooks and the browser
 * runtime. Every hook writes here; the runtime only ever reads from here.
 *
 * Keyed on `element.props` rather than the element itself: props is the one object
 * React hands back untouched, and a WeakMap keeps this from leaking or from showing
 * up as a stray attribute in the DOM.
 *
 * Held on globalThis under Symbol.for so that duplicate copies of this package
 * (pnpm, monorepo, a stale optimizeDeps entry) still converge on one registry.
 */

export const REGISTRY_SYMBOL = Symbol.for("react-code-locator.registry");

export interface SourceLocation {
  /** Path as the compiler reported it. May be absolute; normalized on read. */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based, matching what editors expect in `file:line:column`. */
  column: number;
}

type Registry = WeakMap<object, SourceLocation>;

export function getRegistry(): Registry {
  const store = globalThis as Record<symbol, unknown>;
  let registry = store[REGISTRY_SYMBOL] as Registry | undefined;
  if (!registry) {
    registry = new WeakMap();
    store[REGISTRY_SYMBOL] = registry;
  }
  return registry;
}

/**
 * Property stamped on component functions/classes by the Babel hook. Holds the
 * *definition* site, which no compiler computes for us — see DESIGN.md.
 */
export const COMPONENT_SOURCE_PROP = "__componentSourceLoc";
