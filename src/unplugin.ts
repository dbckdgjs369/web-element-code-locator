/**
 * Unplugin-based universal adapter for all build tools
 * Supports: Vite, Webpack, Rollup, esbuild, Rspack
 *
 * Zero-dependency transform using acorn instead of Babel
 */

import { createUnplugin, type UnpluginInstance, type UnpluginOptions } from "unplugin";
import { transformSource, type TransformOptions } from "./core/transform";
import { createViteClientInjector } from "./viteClientInjector";
import type { LocatorOptions } from "./runtime";
import type { Plugin } from "vite";

export interface ReactCodeLocatorOptions extends Omit<TransformOptions, "filename"> {
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

  /**
   * Auto-inject client runtime into Vite dev server (Vite only)
   * @default true
   */
  injectClient?: boolean;

  /**
   * Options passed to enableReactComponentJump (Vite only)
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
      include = DEFAULT_INCLUDE,
      exclude = DEFAULT_EXCLUDE,
      projectRoot = process.cwd(),
      injectComponentSource = true,
      injectJsxSource = true,
    } = options;

    return {
      name: "react-code-locator",

      transform(code, id) {
        if (process.env.NODE_ENV !== "development") return null;
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
export function vitePlugin(options?: ReactCodeLocatorOptions): Plugin[] {
  const { injectClient = true, locator, ...rest } = options ?? {};
  return [
    _unplugin.vite(rest) as Plugin,
    ...createViteClientInjector({ injectClient, locator }),
  ].filter(Boolean) as Plugin[];
}

// Other build tool adapters
export const webpackPlugin = _unplugin.webpack;
export const rollupPlugin = _unplugin.rollup;
export const esbuildPlugin = _unplugin.esbuild;
export const rspackPlugin = _unplugin.rspack;

export default unplugin;
