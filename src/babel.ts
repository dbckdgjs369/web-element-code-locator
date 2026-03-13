import { babelInjectComponentSource, type BabelInjectComponentSourceOptions } from "./babelInjectComponentSource";
import { defineSourceAdapter } from "./sourceAdapter";

export type BabelSourceAdapterConfig = {
  plugins: Array<[typeof babelInjectComponentSource, BabelInjectComponentSourceOptions]>;
};

export { babelInjectComponentSource } from "./babelInjectComponentSource";
export type { BabelInjectComponentSourceOptions } from "./babelInjectComponentSource";
export type { SourceAdapterDescriptor, SourceAdapterKind, SourceInjectionOptions } from "./sourceAdapter";

export function createBabelSourceAdapter(options: BabelInjectComponentSourceOptions = {}) {
  return defineSourceAdapter<BabelSourceAdapterConfig, BabelInjectComponentSourceOptions>({
    kind: "babel",
    name: "react-code-locator/babel",
    options,
    config: {
      plugins: [[babelInjectComponentSource, options]],
    },
  });
}

export const babelSourceAdapter = createBabelSourceAdapter();
