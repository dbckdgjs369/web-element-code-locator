import { babelInjectComponentSource, type BabelInjectComponentSourceOptions } from "./babelInjectComponentSource";
import { defineSourceAdapter } from "./sourceAdapter";
import { transformSourceWithLocator } from "./sourceTransform";
import { createViteClientInjector, type ViteClientInjectorOptions } from "./viteClientInjector";
import type { Plugin } from "vite";

export type ViteSourceAdapterOptions = ViteClientInjectorOptions & {
  babel?: BabelInjectComponentSourceOptions;
};

export type ViteSourceAdapterConfig = {
  plugins: Plugin[];
};

export { createViteClientInjector as reactComponentJump } from "./viteClientInjector";
export { createViteClientInjector } from "./viteClientInjector";
export type { ViteClientInjectorOptions } from "./viteClientInjector";
export { babelInjectComponentSource } from "./babelInjectComponentSource";
export type { BabelInjectComponentSourceOptions } from "./babelInjectComponentSource";
export type { SourceAdapterDescriptor, SourceAdapterKind, SourceInjectionOptions } from "./sourceAdapter";

function shouldTransformSource(id: string) {
  if (id.includes("/node_modules/") || id.startsWith("\0")) {
    return false;
  }

  return /\.[mc]?[jt]sx?$/.test(id);
}

export function viteSourceTransformPlugin(
  options: BabelInjectComponentSourceOptions = {},
): Plugin {
  return {
    name: "react-code-locator-source-transform",
    enforce: "pre",
    async transform(code, id) {
      if (!shouldTransformSource(id)) {
        return null;
      }

      return transformSourceWithLocator(code, {
        filename: id,
        ...options,
      });
    },
  };
}

export function createViteSourceAdapter(options: ViteSourceAdapterOptions = {}) {
  const { babel = {}, ...viteOptions } = options;
  const plugins = [
    viteSourceTransformPlugin(babel),
    ...createViteClientInjector(viteOptions),
  ].filter(Boolean) as Plugin[];

  return defineSourceAdapter<ViteSourceAdapterConfig, ViteSourceAdapterOptions>({
    kind: "vite",
    name: "react-code-locator/vite",
    options,
    config: {
      plugins,
    },
  });
}

export const viteSourceAdapter = createViteSourceAdapter();
