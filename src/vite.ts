/**
 * Vite Plugin for react-code-locator
 * Uses acorn-based transform (zero-dependency)
 */

import { transformSource } from "./core/transform";
import { createViteClientInjector, type ViteClientInjectorOptions } from "./viteClientInjector";
import type { Plugin } from "vite";

export interface ViteReactCodeLocatorOptions extends ViteClientInjectorOptions {
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
}

function shouldTransformSource(id: string): boolean {
  if (id.includes("/node_modules/") || id.startsWith("\0")) {
    return false;
  }
  return /\.[mc]?[jt]sx?$/.test(id);
}

export function viteSourceTransformPlugin(
  options: Omit<ViteReactCodeLocatorOptions, keyof ViteClientInjectorOptions> = {},
): Plugin {
  const {
    projectRoot = process.cwd(),
    injectComponentSource = true,
    injectJsxSource = true,
  } = options;

  return {
    name: "react-code-locator-source-transform",
    enforce: "pre",
    transform(code, id) {
      if (!shouldTransformSource(id)) {
        return null;
      }

      const result = transformSource(code, {
        filename: id,
        projectRoot,
        injectComponentSource,
        injectJsxSource,
      });

      return result;
    },
  };
}

export function createViteSourceAdapter(options: ViteReactCodeLocatorOptions = {}) {
  const { 
    projectRoot = process.cwd(),
    injectComponentSource = true,
    injectJsxSource = true,
    ...viteOptions 
  } = options;
  
  const plugins = [
    viteSourceTransformPlugin({ projectRoot, injectComponentSource, injectJsxSource }),
    ...createViteClientInjector(viteOptions),
  ].filter(Boolean) as Plugin[];

  return {
    kind: "vite" as const,
    name: "react-code-locator/vite",
    options,
    config: {
      plugins,
    },
  };
}

export { createViteClientInjector as reactComponentJump } from "./viteClientInjector";
export { createViteClientInjector } from "./viteClientInjector";
export type { ViteClientInjectorOptions } from "./viteClientInjector";

export const viteSourceAdapter = createViteSourceAdapter();
