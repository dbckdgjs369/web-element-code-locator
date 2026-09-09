export { getRegistry, REGISTRY_SYMBOL, COMPONENT_SOURCE_PROP } from "./registry";
export type { SourceLocation } from "./registry";

export { locate, locateAsync } from "./locate";
export type { LocatorMode, LocatorResult } from "./locate";

export { detectDevServer, editorRequestFor } from "./dev-server";
export type { DevServerKind } from "./dev-server";

export { enableLocator } from "./runtime";
export type { LocatorOptions, TriggerKey } from "./runtime";

export {
  openInEditor,
  openInEditorMiddleware,
  OPEN_IN_EDITOR_PATH,
} from "./open-in-editor";
export type { OpenInEditorOptions } from "./open-in-editor";

export { reactCodeLocator, default as vitePlugin } from "./integrations/vite";
export type { ReactCodeLocatorOptions } from "./integrations/vite";

// Hook-C-only integrations for standalone bundlers. rspack takes the webpack plugin —
// same plugin surface, and this one only touches resolve.alias.
export { ReactCodeLocatorPlugin } from "./integrations/webpack";
export type { WebpackPluginOptions } from "./integrations/webpack";
export { rollupPlugin } from "./integrations/rollup";
export type { RollupPluginOptions } from "./integrations/rollup";
export { esbuildPlugin } from "./integrations/esbuild";
export type { EsbuildPluginOptions } from "./integrations/esbuild";

export { default as babelPlugin } from "./babel/plugin";
export type { BabelPluginOptions } from "./babel/plugin";
