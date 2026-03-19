/**
 * SWC Integration for react-code-locator
 * Uses acorn-based transform (zero-dependency)
 */

import { transformSource, type TransformOptions } from "./core/transform";

export interface SwcSourceTransformOptions extends Omit<TransformOptions, 'filename'> {
  sourceMaps?: boolean;
}

export type SwcSourceTransform = (
  code: string,
  options: SwcSourceTransformOptions & { filename: string },
) => Promise<{
  code: string;
  map: unknown;
}>;

export interface SwcSourceAdapterConfig {
  transform: SwcSourceTransform;
}

export async function transformSourceWithSwcLocator(
  code: string,
  options: SwcSourceTransformOptions & { filename: string },
) {
  const result = transformSource(code, options);
  return {
    code: result ? result.code : code,
    map: result?.map ?? null,
  };
}

export function createSwcSourceAdapter(options: SwcSourceTransformOptions = {}) {
  const resolvedOptions = {
    projectRoot: process.cwd(),
    injectComponentSource: true,
    injectJsxSource: true,
    ...options,
  };

  const transform: SwcSourceTransform = (code, transformOptions) =>
    transformSourceWithSwcLocator(code, {
      ...resolvedOptions,
      ...transformOptions,
    });

  return {
    kind: "swc" as const,
    name: "react-code-locator/swc",
    options: resolvedOptions,
    config: {
      transform,
    },
  };
}

export const swcSourceAdapter = createSwcSourceAdapter();
