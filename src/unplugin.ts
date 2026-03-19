/**
 * Unplugin-based universal adapter for all build tools
 * Supports: Vite, Webpack, Rollup, esbuild, Rspack
 * 
 * Zero-dependency transform using acorn instead of Babel
 */

import { createUnplugin, type UnpluginInstance, type UnpluginOptions } from "unplugin";
import { transformSource, type TransformOptions } from "./core/transform";

export interface ReactCodeLocatorOptions extends Omit<TransformOptions, 'filename'> {
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

export type { TransformOptions };

const DEFAULT_INCLUDE = /\.([jt]sx)$/;
const DEFAULT_EXCLUDE = /node_modules/;

function shouldTransform(id: string, include: RegExp | RegExp[], exclude: RegExp | RegExp[]): boolean {
  const includePatterns = Array.isArray(include) ? include : [include];
  const excludePatterns = Array.isArray(exclude) ? exclude : [exclude];
  
  // Check exclude first
  if (excludePatterns.some(pattern => pattern.test(id))) {
    return false;
  }
  
  // Then check include
  return includePatterns.some(pattern => pattern.test(id));
}

export const unplugin: UnpluginInstance<ReactCodeLocatorOptions | undefined, false> = 
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
        // Skip if doesn't match patterns
        if (!shouldTransform(id, include, exclude)) {
          return null;
        }

        // Perform transform using acorn (zero-dependency)
        const result = transformSource(code, {
          filename: id,
          projectRoot,
          injectComponentSource,
          injectJsxSource,
        });

        return result;
      },
    } as UnpluginOptions;
  });

// Export individual build tool adapters
export const vitePlugin = unplugin.vite;
export const webpackPlugin = unplugin.webpack;
export const rollupPlugin = unplugin.rollup;
export const esbuildPlugin = unplugin.esbuild;
export const rspackPlugin = unplugin.rspack;

// Default export for direct usage
export default unplugin;
