/**
 * esbuild integration — hook C only, same scope as the webpack one (see webpack.ts).
 *
 * esbuild was the one bundler v1's approach never lost anything on and this package's
 * approach could not initially match: no Babel pass means no hook D. With component
 * definition locations dropped as a feature, the gap is gone — `jsxDev: true` makes
 * esbuild emit `__source` call sites itself, and this plugin just makes sure they land in
 * the registry by routing `react/jsx-dev-runtime` through the generated shim.
 *
 * Requires the build to run with `jsx: "automatic"` and `jsxDev: true` (or a tsconfig
 * with `"jsx": "react-jsxdev"`); with the plain `react-jsx` transform there is no source
 * argument and nothing to capture.
 */

import { generateShim } from "./shim";

export interface EsbuildPluginOptions {
  /** Paths are reported relative to this. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Where the generated shim is written. Defaults to <root>/node_modules/.cache. */
  cacheDir?: string;
  /** Defaults to true; harmless in prod builds, where nothing imports the dev runtime. */
  enabled?: boolean;
}

/** Structural subset of esbuild's Plugin, to avoid a type dependency on esbuild itself. */
interface EsbuildPluginLike {
  name: string;
  setup: (build: {
    onResolve: (
      options: { filter: RegExp },
      callback: (args: { path: string }) => { path: string } | undefined,
    ) => void;
  }) => void;
}

export function esbuildPlugin(options: EsbuildPluginOptions = {}): EsbuildPluginLike {
  const { enabled = true } = options;

  return {
    name: "react-code-locator",
    setup(build) {
      if (!enabled) return;
      const projectRoot = options.projectRoot ?? process.cwd();
      const shimPath = generateShim({ projectRoot, cacheDir: options.cacheDir });
      if (!shimPath) return;

      // Anchored on both ends — exact specifier only. The shim requires the real runtime
      // by file path, so this rewrite cannot loop back into itself.
      build.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => ({ path: shimPath }));
    },
  };
}

export default esbuildPlugin;
