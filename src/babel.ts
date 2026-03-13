import { babelInjectComponentSource, type BabelInjectComponentSourceOptions } from "./babelInjectComponentSource";
import { defineSourceAdapter } from "./sourceAdapter";

export type BabelSourceAdapterConfig = {
  plugins: Array<[typeof babelInjectComponentSource, BabelInjectComponentSourceOptions]>;
};

export { babelInjectComponentSource } from "./babelInjectComponentSource";
export type { BabelInjectComponentSourceOptions } from "./babelInjectComponentSource";
export type { SourceAdapterDescriptor, SourceAdapterKind, SourceInjectionOptions } from "./sourceAdapter";

export function createBabelSourceAdapter(options: BabelInjectComponentSourceOptions = {}) {
  const resolvedOptions = {
    projectRoot: process.cwd(),
    ...options,
  };

  return defineSourceAdapter<BabelSourceAdapterConfig, BabelInjectComponentSourceOptions>({
    kind: "babel",
    name: "react-code-locator/babel",
    options: resolvedOptions,
    config: {
      plugins: [[babelInjectComponentSource, resolvedOptions]],
    },
  });
}

export const babelSourceAdapter = createBabelSourceAdapter();
