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
import { openInEditorMiddleware } from "./openInEditorPlugin";
import type { LocatorOptions } from "./runtime";
import { DEFAULT_EDITOR, type SupportedEditor } from "./editors";
import type { Plugin } from "vite";

export interface ReactCodeLocatorOptions {
  /**
   * Enable the plugin. Defaults to NODE_ENV === "development".
   * Use this if your project uses a custom env variable instead of NODE_ENV.
   * @example enabled: process.env.MY_ENV === 'dev'
   */
  enabled?: boolean;

  /**
   * Project root for relative path calculation.
   * Required in monorepo setups where process.cwd() differs from the project root.
   * @default process.cwd()
   */
  projectRoot?: string;

  /** @internal */
  include?: RegExp | RegExp[];
  /** @internal */
  exclude?: RegExp | RegExp[];
}

interface InternalPluginOptions extends ReactCodeLocatorOptions {
  injectComponentSource?: boolean;
  injectJsxSource?: boolean;
}

export interface ViteReactCodeLocatorOptions extends ReactCodeLocatorOptions {
  /**
   * Auto-inject client runtime into Vite dev server.
   * Set to false to manage enableReactComponentJump() manually.
   * @default true
   */
  injectClient?: boolean;

  /**
   * Editor to open when a source location is found.
   * @default "code"
   */
  editor?: SupportedEditor;

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

const _unplugin: UnpluginInstance<InternalPluginOptions | undefined, false> =
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

      transformInclude(id) {
        return shouldTransform(id, include, exclude);
      },

      transform(code, id) {
        const isEnabled = enabled ?? process.env.NODE_ENV === "development";
        if (!isEnabled) return null;

        return transformSource(code, {
          filename: id,
          projectRoot,
          injectComponentSource,
          injectJsxSource,
        });
      },
    } as UnpluginOptions;
  });

export const unplugin = _unplugin as unknown as UnpluginInstance<ReactCodeLocatorOptions | undefined, false>;

// Vite plugin: source transform + client auto-injection
// Creates a native Vite plugin (not via unplugin adapter) to guarantee enforce:"pre" is respected
export function vitePlugin(options?: ViteReactCodeLocatorOptions): Plugin[] {
  const {
    enabled,
    injectClient = true,
    editor,
    locator,
    include = DEFAULT_INCLUDE,
    exclude = DEFAULT_EXCLUDE,
    projectRoot = process.cwd(),
    injectComponentSource = true,
    injectJsxSource = true,
  } = (options ?? {}) as ViteReactCodeLocatorOptions & InternalPluginOptions;

  let resolvedEnabled = false;

  const transformPlugin: Plugin = {
    name: "react-code-locator",
    enforce: "pre",
    configResolved(config) {
      resolvedEnabled = enabled ?? config.command === "serve";
    },
    configureServer(server) {
      server.middlewares.use("/__open-in-editor", openInEditorMiddleware(editor ?? DEFAULT_EDITOR, projectRoot));
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
export const webpackPlugin = _unplugin.webpack as UnpluginInstance<ReactCodeLocatorOptions | undefined, false>["webpack"];
export const rollupPlugin = _unplugin.rollup as UnpluginInstance<ReactCodeLocatorOptions | undefined, false>["rollup"];
export const esbuildPlugin = _unplugin.esbuild as UnpluginInstance<ReactCodeLocatorOptions | undefined, false>["esbuild"];
export const rspackPlugin = _unplugin.rspack as UnpluginInstance<ReactCodeLocatorOptions | undefined, false>["rspack"];

export default unplugin;
