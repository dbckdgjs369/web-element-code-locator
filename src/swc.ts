import { defineSourceAdapter, type SourceInjectionOptions } from "./sourceAdapter";
import { transformSourceWithLocator } from "./sourceTransform";

export type SwcSourceTransformOptions = SourceInjectionOptions & {
  filename: string;
  sourceMaps?: boolean;
};

export type SwcSourceTransform = (
  code: string,
  options: SwcSourceTransformOptions,
) => Promise<{
  code: string;
  map: unknown;
}>;

export type SwcSourceAdapterConfig = {
  transform: SwcSourceTransform;
};

export async function transformSourceWithSwcLocator(
  code: string,
  options: SwcSourceTransformOptions,
) {
  return transformSourceWithLocator(code, options);
}

export function createSwcSourceAdapter(options: SourceInjectionOptions = {}) {
  const resolvedOptions = {
    projectRoot: process.cwd(),
    ...options,
  };

  const transform: SwcSourceTransform = (code, transformOptions) =>
    transformSourceWithSwcLocator(code, {
      ...resolvedOptions,
      ...transformOptions,
    });

  return defineSourceAdapter<SwcSourceAdapterConfig>({
    kind: "swc",
    name: "react-code-locator/swc",
    options: resolvedOptions,
    config: {
      transform,
    },
  });
}

export const swcSourceAdapter = createSwcSourceAdapter();
