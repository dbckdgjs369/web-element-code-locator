// Runtime exports
export { enableReactComponentJump, locateComponentSource } from "./runtime";
export type { LocatorMode, LocatorOptions, LocatorResult, TriggerKey } from "./runtime";

// Plugin exports from unplugin
export { unplugin as default } from "./unplugin";
export {
  vitePlugin,
  webpackPlugin,
  rollupPlugin,
  esbuildPlugin,
  rspackPlugin,
} from "./unplugin";

// Re-export types
export type { ReactCodeLocatorOptions, ViteReactCodeLocatorOptions } from "./unplugin";

// Open in editor middleware (for webpack/rspack devServer)
export { openInEditorMiddleware } from "./openInEditorPlugin";

// Editor constants
export { SUPPORTED_EDITORS, DEFAULT_EDITOR } from "./editors";
export type { SupportedEditor } from "./editors";
