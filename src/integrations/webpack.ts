/**
 * webpack integration — and rspack's, because rspack implements the same plugin surface
 * and the only thing this plugin touches is `compiler.options.resolve.alias`.
 *
 * Standalone bundlers get less than the framework integrations do, deliberately:
 *
 *   - Hook C only. JSX *call sites* come out of the compiler's own `__source` emit and are
 *     captured by the shim. Component definition locations (hook D) needed a Babel pass,
 *     and that feature has been dropped — the one supported question is "which line of my
 *     code produced this element".
 *   - No client auto-injection: there is no HTML hook to inject through, so the app calls
 *     `enableLocator()` itself, exactly as on Next.
 *   - No editor endpoint: mount `openInEditorMiddleware` on the dev server
 *     (`devServer.setupMiddlewares`) to make "Open in editor" work; without it the menu
 *     still offers "Copy path".
 */

import path from "node:path";
import { generateShim, JSX_DEV_RUNTIME_SPECIFIER } from "./shim";

export interface WebpackPluginOptions {
  /** Paths are reported relative to this. Defaults to the compiler context. */
  projectRoot?: string;
  /** Where the generated shim is written. Defaults to <root>/node_modules/.cache. */
  cacheDir?: string;
  /** Defaults to `mode !== "production"`; the dev runtime does not exist in prod builds. */
  enabled?: boolean;
}

interface CompilerLike {
  context?: string;
  options: {
    mode?: string;
    resolve?: { alias?: Record<string, unknown> | unknown[]; plugins?: unknown[] };
  };
}

export class ReactCodeLocatorPlugin {
  private readonly options: WebpackPluginOptions;

  constructor(options: WebpackPluginOptions = {}) {
    this.options = options;
  }

  apply(compiler: CompilerLike): void {
    const enabled = this.options.enabled ?? compiler.options.mode !== "production";
    if (!enabled) return;

    const projectRoot = this.options.projectRoot ?? compiler.context ?? process.cwd();
    const shimPath = generateShim({ projectRoot, cacheDir: this.options.cacheDir });
    if (!shimPath) return; // warned already; degrade to "locating unavailable"

    const resolve = (compiler.options.resolve ??= {});
    // The array form takes {alias, name} objects; merging an exact-match record into it
    // would silently change its meaning, so leave those configs alone rather than guess.
    if (Array.isArray(resolve.alias)) {
      console.warn(
        "[react-code-locator] resolve.alias is an array; add the alias yourself: " +
          `{ alias: "${JSX_DEV_RUNTIME_SPECIFIER}", onlyModule: true } -> ${shimPath}`,
      );
      return;
    }
    resolve.alias = {
      ...resolve.alias,
      // `$` is an exact match — it must not swallow `react/jsx-dev-runtime/something`.
      [`${JSX_DEV_RUNTIME_SPECIFIER}$`]: shimPath,
    };

    // CRA-style configs run react-dev-utils' ModuleScopePlugin, which rejects any import
    // that resolves outside src/ — including the alias target above (found in the field:
    // 86 "falls outside of the project src/ directory" errors on a real CRA-eject app).
    // CRA itself allow-lists the react-refresh runtime this way; the shim and its wrap
    // copy get the same treatment. Detected structurally to avoid depending on the class.
    for (const plugin of resolve.plugins ?? []) {
      const scoped = plugin as { allowedFiles?: Set<string>; allowedPaths?: string[] };
      if (scoped?.allowedFiles instanceof Set) {
        scoped.allowedFiles.add(shimPath);
        scoped.allowedFiles.add(path.join(path.dirname(shimPath), "wrap.js"));
        // Newer react-dev-utils also keeps a derived directory list.
        if (Array.isArray(scoped.allowedPaths)) scoped.allowedPaths.push(path.dirname(shimPath));
      }
    }
  }
}

export default ReactCodeLocatorPlugin;
