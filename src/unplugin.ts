/**
 * Unplugin-based universal adapter for all build tools
 * Supports: Vite, Webpack, Rollup, esbuild, Rspack
 *
 * Zero-dependency transform using acorn instead of Babel
 */

import { readFileSync } from "node:fs";
import { createUnplugin, type UnpluginInstance, type UnpluginOptions } from "unplugin";
import { transformSource, type TransformOptions } from "./core/transform";
import { createViteClientInjector } from "./viteClientInjector";
import type { LocatorOptions } from "./runtime";
import type { Plugin } from "vite";

export interface ReactCodeLocatorOptions extends Omit<TransformOptions, "filename"> {
  /**
   * Enable the plugin. Defaults to NODE_ENV === "development".
   * Use this if your project uses a custom env variable instead of NODE_ENV.
   * @example enabled: process.env.MY_ENV === 'dev'
   */
  enabled?: boolean;

  /**
   * Enable source transform for component definitions
   * @default true
   */
  injectComponentSource?: boolean;

  /**
   * Enable source transform for JSX call sites
   * @default true
   */
  injectJsxSource?: boolean;

  /**
   * Project root for relative path calculation
   * @default process.cwd()
   */
  projectRoot?: string;

  /**
   * Include filter for file paths
   * @default /\.[jt]sx$/
   */
  include?: RegExp | RegExp[];

  /**
   * Exclude filter for file paths
   * @default /node_modules/
   */
  exclude?: RegExp | RegExp[];
}

export interface ViteReactCodeLocatorOptions extends ReactCodeLocatorOptions {
  /**
   * Auto-inject client runtime into Vite dev server.
   * Set to false to manage enableReactComponentJump() manually.
   * @default true
   */
  injectClient?: boolean;

  /**
   * Options passed to enableReactComponentJump when injectClient is true.
   */
  locator?: LocatorOptions;
}

export type { TransformOptions };

const DEFAULT_INCLUDE = /\.([jt]sx)$/;
const DEFAULT_EXCLUDE = /node_modules/;

function shouldTransform(id: string, include: RegExp | RegExp[], exclude: RegExp | RegExp[]): boolean {
  const includePatterns = Array.isArray(include) ? include : [include];
  const excludePatterns = Array.isArray(exclude) ? exclude : [exclude];

  if (excludePatterns.some((pattern) => pattern.test(id))) {
    return false;
  }

  return includePatterns.some((pattern) => pattern.test(id));
}

const _unplugin: UnpluginInstance<ReactCodeLocatorOptions | undefined, false> =
  createUnplugin((options = {}) => {
    const {
      enabled,
      include = DEFAULT_INCLUDE,
      exclude = DEFAULT_EXCLUDE,
      projectRoot = process.cwd(),
      injectComponentSource = true,
      injectJsxSource = true,
    } = options;

    return {
      name: "react-code-locator",
      enforce: "pre",

      transform(code, id) {
        const isEnabled = enabled ?? process.env.NODE_ENV === "development";
        if (!isEnabled) return null;
        if (!shouldTransform(id, include, exclude)) {
          return null;
        }

        return transformSource(code, {
          filename: id,
          projectRoot,
          injectComponentSource,
          injectJsxSource,
        });
      },
    } as UnpluginOptions;
  });

export const unplugin = _unplugin;

// Vite plugin: source transform + client auto-injection
// Creates a native Vite plugin (not via unplugin adapter) to guarantee enforce:"pre" is respected
export function vitePlugin(options?: ViteReactCodeLocatorOptions): Plugin[] {
  const {
    enabled,
    injectClient = true,
    locator,
    include = DEFAULT_INCLUDE,
    exclude = DEFAULT_EXCLUDE,
    projectRoot = process.cwd(),
    injectComponentSource = true,
    injectJsxSource = true,
  } = options ?? {};

  let resolvedEnabled = false;

  const transformPlugin: Plugin = {
    name: "react-code-locator",
    enforce: "pre",
    configResolved(config) {
      resolvedEnabled = enabled ?? config.command === "serve";
    },
    transform(code, id) {
      if (!resolvedEnabled) return null;
      const filepath = id.split("?")[0];
      if (!shouldTransform(filepath, include, exclude)) return null;

      // @vitejs/plugin-react (enforce: "pre") may run before us and prepend a fast-refresh
      // preamble (~19 lines) to the file. This shifts all line numbers, producing wrong source
      // locations. Detect the preamble by comparing with the original source on disk, strip it,
      // transform the stripped code (correct line numbers), then prepend it back.
      let preamble = "";
      let codeForTransform = code;

      try {
        const originalCode = readFileSync(filepath, "utf8");
        if (code !== originalCode && code.length > originalCode.length) {
          const originalHead = originalCode.slice(0, 60);
          const idx = code.indexOf(originalHead);
          if (idx > 0) {
            preamble = code.slice(0, idx);
            codeForTransform = originalCode;
          }
        }
      } catch {
        // ignore — fall back to transforming current code as-is
      }

      const result = transformSource(codeForTransform, { filename: filepath, projectRoot, injectComponentSource, injectJsxSource });
      if (!result) return null;

      if (!preamble) return result;

      const preambleLineCount = (preamble.match(/\n/g) ?? []).length;
      const map = result.map;
      if (map && typeof map === "object" && typeof map.mappings === "string") {
        map.mappings = ";".repeat(preambleLineCount) + map.mappings;
      }

      return { code: preamble + result.code, map };
    },
  };

  return [
    transformPlugin,
    ...createViteClientInjector({ injectClient, locator: enabled === false ? { ...locator, enabled: false } : locator, projectRoot }),
  ].filter(Boolean) as Plugin[];
}

// Other build tool adapters
export const webpackPlugin = _unplugin.webpack;
export const rollupPlugin = _unplugin.rollup;
export const esbuildPlugin = _unplugin.esbuild;
export const rspackPlugin = _unplugin.rspack;

export default unplugin;
