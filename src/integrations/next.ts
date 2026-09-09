/**
 * Next.js integration.
 *
 * Wraps next.config so that both bundler modes are covered from one place. The v1 package
 * only registered itself inside the `webpack()` hook, and Turbopack never calls that hook —
 * which is why it silently did nothing under Turbopack with no error and no warning.
 *
 * Hook C works here too, but not the way it does in Vite. webpack and Turbopack alias by
 * specifier with no importer escape hatch, so aliasing `react/jsx-dev-runtime` would also
 * rewrite our own wrapper's import of it and produce a cycle. We break that by resolving
 * React's real path in Node at config time and generating a shim that requires it by
 * absolute path — the alias can then never point back at itself.
 *
 * Hook D is not available: Next compiles with SWC, which takes no JavaScript plugins. That
 * costs component *definition* locations. JSX call sites still work, and measurement shows
 * SWC's `__source` line numbers are correct in both modes (playground/next/check.mjs).
 */

import path from "node:path";
import {
  generateShim,
  defaultCacheDir,
  JSX_DEV_RUNTIME_SPECIFIER as SPECIFIER,
} from "./shim";

export interface WithReactCodeLocatorOptions {
  /** Set false to leave next.config untouched (e.g. to gate on an env var). */
  enabled?: boolean;
  /** Where the generated shim is written. Defaults to <root>/node_modules/.cache. */
  cacheDir?: string;
  projectRoot?: string;
}

// Next ships its own React under next/dist/compiled and wires the app to *that* copy.
// Wrapping the project's plain `react` instead splits React's internal state across two
// instances, and the first render dies on `recentlyCreatedOwnerStacks` of undefined.
// Prefer the vendored copy; fall back to the plain one for setups that don't have it.
const NEXT_RUNTIME_CANDIDATES = ["next/dist/compiled/react/jsx-dev-runtime", SPECIFIER];

/**
 * Aliases the JSX dev runtime everywhere webpack might resolve it.
 *
 * A top-level `resolve.alias` is not enough under the App Router: Next resolves React
 * per module-rule layer (`app-pages-browser`, `react-server-components`, …), and a
 * rule-level `resolve.alias` wins over the top-level one. Any rule that already pins a
 * React path is a rule that would otherwise bypass us, so each one gets the alias too.
 *
 * `$` is an exact match — it must not swallow `react/jsx-dev-runtime/something`.
 */
function applyWebpackAlias(config: any, shimPath: string): void {
  const entry = { [`${SPECIFIER}$`]: shimPath };

  config.resolve = config.resolve ?? {};
  config.resolve.alias = { ...config.resolve.alias, ...entry };

  const visit = (rules: any[] | undefined) => {
    if (!Array.isArray(rules)) return;
    for (const rule of rules) {
      if (!rule || typeof rule !== "object") continue;
      // Arrays are used for multi-target aliases; leave those alone rather than guess.
      if (rule.resolve?.alias && !Array.isArray(rule.resolve.alias)) {
        rule.resolve.alias = { ...rule.resolve.alias, ...entry };
      }
      visit(rule.oneOf);
      visit(rule.rules);
    }
  };
  visit(config.module?.rules);
}

type NextConfig = Record<string, any>;

export function withReactCodeLocator(
  nextConfig: NextConfig = {},
  options: WithReactCodeLocatorOptions = {},
): NextConfig {
  const { enabled = process.env.NODE_ENV !== "production" } = options;
  if (!enabled) return nextConfig;

  const projectRoot = options.projectRoot ?? process.cwd();
  const cacheDir = options.cacheDir ?? defaultCacheDir(projectRoot);

  const shimPath = generateShim({
    projectRoot,
    cacheDir,
    runtimeCandidates: NEXT_RUNTIME_CANDIDATES,
  });
  if (!shimPath) return nextConfig;

  const userWebpack = nextConfig.webpack;

  return {
    ...nextConfig,

    // Turbopack reads this; the webpack() hook below is never called in that mode.
    turbopack: {
      ...nextConfig.turbopack,
      resolveAlias: {
        ...nextConfig.turbopack?.resolveAlias,
        // Turbopack wants a specifier relative to the project root, not an absolute path.
        // Handing it one produces "server relative imports are not implemented yet",
        // because it prefixes the path with "." and then cannot resolve "./Users/...".
        [SPECIFIER]: `./${path
          .relative(projectRoot, shimPath)
          .split(path.sep)
          .join("/")}`,
      },
    },

    webpack(config: any, context: any) {
      const merged = userWebpack ? userWebpack(config, context) : config;
      applyWebpackAlias(merged, shimPath);
      return merged;
    },
  };
}

export default withReactCodeLocator;
