/**
 * rollup integration — hook C only, same scope as the webpack one (see webpack.ts for why
 * standalone bundlers get no hook D, no client auto-injection and no editor endpoint).
 *
 * rollup's `resolveId` does receive the importer, so the Vite-style cycle exemption would
 * work here. The shim is used anyway: it is what bakes the project root into the wrapper,
 * and rollup builds have no other place to learn it (see WrapOptions in wrap.ts).
 *
 * The shim is CommonJS, so the build needs @rollup/plugin-commonjs — which any bundle that
 * includes React already has.
 */

import { generateShim, JSX_DEV_RUNTIME_SPECIFIER } from "./shim";

export interface RollupPluginOptions {
  /** Paths are reported relative to this. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Where the generated shim is written. Defaults to <root>/node_modules/.cache. */
  cacheDir?: string;
  /** Defaults to true; harmless in prod builds, where nothing imports the dev runtime. */
  enabled?: boolean;
}

/** Structural subset of rollup's Plugin, to avoid a type dependency on rollup itself. */
interface RollupPluginLike {
  name: string;
  buildStart?: () => void;
  resolveId?: (id: string) => string | null;
}

export function rollupPlugin(options: RollupPluginOptions = {}): RollupPluginLike {
  const { enabled = true } = options;
  let shimPath: string | null = null;

  return {
    name: "react-code-locator",

    buildStart() {
      if (!enabled) return;
      const projectRoot = options.projectRoot ?? process.cwd();
      shimPath = generateShim({ projectRoot, cacheDir: options.cacheDir });
    },

    resolveId(id: string) {
      // Exact match only — never `react/jsx-dev-runtime/something`. The shim reaches the
      // real runtime by file path, so this alias cannot point back at itself.
      if (id === JSX_DEV_RUNTIME_SPECIFIER && shimPath) return shimPath;
      return null;
    },
  };
}

export default rollupPlugin;
