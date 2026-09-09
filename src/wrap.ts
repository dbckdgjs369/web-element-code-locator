/**
 * The interception itself, factored out so it can be applied two ways:
 *
 *   - as a module (src/jsx-dev-runtime.ts), for bundlers that let us redirect a bare
 *     specifier by importer, e.g. Vite's resolveId
 *   - as a function applied to an already-resolved runtime object, for bundlers whose
 *     aliasing is specifier-based and has no importer escape hatch. webpack and Turbopack
 *     are both in this category: aliasing `react/jsx-dev-runtime` would also rewrite our
 *     own import of it and create a cycle. The Next integration sidesteps that by
 *     resolving React's real path itself and handing the module in here.
 */

import { getRegistry } from "./registry";
import { toProjectRelative } from "./paths";

export interface JsxDevSource {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface WrapOptions {
  /**
   * Stripped from `__source.fileName` so the registry holds project-relative paths.
   *
   * It has to happen here rather than in the browser: SWC bakes an absolute path into
   * `__source` at build time, and by the time the runtime reads it there is nothing left
   * in the page that knows where the project lives. Without this, Next reports
   * `/Users/me/app/page.tsx:7:10` where Vite reports `app/page.tsx:7:10`, and "Copy path"
   * yields something that only works on the machine that built it.
   */
  projectRoot?: string;
}

type JsxDevFn = (
  type: unknown,
  props: unknown,
  key: unknown,
  isStaticChildren: unknown,
  source: JsxDevSource | undefined,
  self: unknown,
) => unknown;

export function wrapJsxDev(original: JsxDevFn, options: WrapOptions = {}): JsxDevFn {
  const registry = getRegistry();
  const { projectRoot } = options;

  return function jsxDEV(type, props, key, isStaticChildren, source, self) {
    // Normalize *before* forwarding: React ≤18 stores this object on `fiber._debugSource`,
    // and the locate fallback reads it there. Passing it through raw made the same file
    // come out absolute via _debugSource and project-relative via the registry.
    let normalized = source;
    if (source?.fileName) {
      const file = toProjectRelative(source.fileName, projectRoot);
      if (file !== source.fileName) normalized = { ...source, fileName: file };
    }

    const element = original(type, props, key, isStaticChildren, normalized, self);

    // `source` is absent for elements not created from JSX — React.createElement,
    // cloneElement, anything a library builds by hand. Those stay unlocatable, quietly.
    if (normalized?.fileName && element && typeof element === "object") {
      const elementProps = (element as { props?: unknown }).props;
      if (elementProps && typeof elementProps === "object") {
        registry.set(elementProps, {
          file: normalized.fileName,
          line: normalized.lineNumber ?? 1,
          column: normalized.columnNumber ?? 1,
        });
      }
    }

    return element;
  };
}

/** Returns a drop-in replacement for a `react/jsx-dev-runtime` module object. */
export function wrapJsxDevRuntime<T extends { jsxDEV?: unknown }>(
  runtime: T,
  options: WrapOptions = {},
): T {
  if (typeof runtime?.jsxDEV !== "function") return runtime;
  return { ...runtime, jsxDEV: wrapJsxDev(runtime.jsxDEV as JsxDevFn, options) };
}
