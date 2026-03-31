# React Code Locator

A package that lets you right-click any element in your React app during development to jump directly to its source code location.

- **Zero dependencies**: No Babel, no React DevTools, no browser extension — just one build plugin.
- **React 19 support**: `fiber._debugSource` was removed in React 19. This package injects source metadata at build time, so it works regardless of the React version.
- **Universal**: Supports Vite, Webpack, Rollup, esbuild, and Rspack.
- **Dev only**: No impact on production builds.

## Installation

```bash
npm i -D react-code-locator
```

## Quick Start

### Vite

`vitePlugin` handles both source transform and automatic client runtime injection.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vitePlugin } from "react-code-locator";

export default defineConfig({
  plugins: [
    react(),
    vitePlugin(),
  ],
});
```

### Next.js (Webpack)

```js
// next.config.js
const { webpackPlugin } = require("react-code-locator");

module.exports = {
  webpack(config) {
    config.plugins.push(webpackPlugin());
    return config;
  },
};
```

### Create React App

```js
// config-overrides.js
const { webpackPlugin } = require("react-code-locator");

module.exports = {
  webpack(config) {
    config.plugins.push(webpackPlugin());
    return config;
  },
};
```

### Rollup

```js
// rollup.config.js
import { rollupPlugin } from "react-code-locator";

export default {
  plugins: [rollupPlugin()],
};
```

### esbuild

```js
import { esbuildPlugin } from "react-code-locator";

await esbuild.build({
  plugins: [esbuildPlugin()],
});
```

### Rspack

```js
// rspack.config.js
const { rspackPlugin } = require("react-code-locator");

module.exports = {
  plugins: [rspackPlugin()],
};
```

## Options

```ts
// Options shared by all plugins
webpackPlugin({
  // Whether to enable the plugin (default: NODE_ENV === "development")
  // Set this explicitly if you use a custom environment variable instead of NODE_ENV.
  enabled: process.env.MY_ENV === "dev",

  projectRoot: process.cwd(),    // Project root — base path for resolving source locations (default: process.cwd())
});

// Vite-only additional options
vitePlugin({
  enabled: process.env.MY_ENV === "dev",
  projectRoot: process.cwd(),

  // injectClient: true (default) — automatically injects enableReactComponentJump() into the HTML.
  // injectClient: false — disables auto injection; call enableReactComponentJump() manually.
  injectClient: true,

  editor: "code",                // Editor to open files in (default: "code"). See supported editors below.

  locator: {                     // Runtime options (injected automatically when injectClient: true)
    triggerKey: "shift",         // Trigger key: "alt" | "meta" | "ctrl" | "shift" | "none" (default: "shift")
    projectRoot: process.cwd(),  // Base path for normalizing source paths (default: not set)
    openInEditor: true,          // Show "Open in editor" in the right-click menu (default: false)
    onLocate(result) {},         // Callback when a source location is found
    onError(error) {},           // Callback on error
  },
});
```

## Usage

### Hover Highlight

Hold the trigger key (default: `Shift`) and hover over an element. The element will be highlighted in blue like a DevTools inspector, showing the component file name and line number.

### Right-Click Context Menu

Hold the trigger key and **right-click** any element to open the context menu.

```
┌─────────────────────────────────┐
│  Open in editor                 │  ← openInEditor: true 일 때 표시
│  Copy path                      │
└─────────────────────────────────┘
```

| Item | Action |
|------|--------|
| Open in editor | Opens the source file in your editor and jumps to the exact line (shown when `openInEditor: true`) |
| Copy path | Copies the source path in `file:line:col` format to the clipboard |

> The browser's default context menu is automatically suppressed.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Shift + Click` | Print source location to the console |
| `Alt + 1` | Screen mode (components visible on screen, default) |
| `Alt + 2` | Implementation mode (implementation location) |

## Opening in Editor

Set `openInEditor: true` to show the "Open in editor" option in the right-click menu.

### Vite

The `/__open-in-editor` endpoint is automatically registered by `vitePlugin`. No extra setup needed.

```ts
// vite.config.ts
vitePlugin({
  editor: "code",   // editor command (default: "code")
  locator: {
    openInEditor: true,
  },
})
```

### Webpack / Rspack

Add `openInEditorMiddleware` to your devServer and pass the editor command.

```js
// webpack.config.js
const { webpackPlugin, openInEditorMiddleware } = require("react-code-locator");

module.exports = {
  plugins: [webpackPlugin()],
  devServer: {
    setupMiddlewares(middlewares) {
      middlewares.unshift({
        name: "open-in-editor",
        path: "/__open-in-editor",
        middleware: openInEditorMiddleware("code"),  // pass your editor command
      });
      return middlewares;
    },
  },
};
```

```ts
// main.tsx
import { enableReactComponentJump } from "react-code-locator";

enableReactComponentJump({ openInEditor: true });
```

### Supported Editors

| Editor | Command |
|--------|---------|
| VS Code | `"code"` |
| VS Code Insiders | `"code-insiders"` |
| Cursor | `"cursor"` |
| VSCodium | `"codium"` / `"vscodium"` |
| WebStorm | `"webstorm"` |
| IntelliJ IDEA | `"idea"` |
| GoLand | `"goland"` |
| PyCharm | `"pycharm"` |
| PhpStorm | `"phpstorm"` |
| RubyMine | `"rubymine"` |
| CLion | `"clion"` |
| Rider | `"rider"` |
| Zed | `"zed"` |
| Sublime Text | `"subl"` |
| Atom | `"atom"` |
| Vim | `"vim"` |
| Emacs | `"emacs"` |

## Manual Setup

Disable auto injection with `injectClient: false` and call `enableReactComponentJump` manually to control activation. This approach is also used in non-Vite environments.

```ts
// vite.config.ts
vitePlugin({ injectClient: false })
```

```ts
// main.tsx
import { enableReactComponentJump } from "react-code-locator";

enableReactComponentJump({
  enabled: true,                   // default: true. Set to false to disable.
  triggerKey: "shift",             // "alt" | "meta" | "ctrl" | "shift" | "none" (default: "shift")
  projectRoot: "/path/to/project", // Base path for normalizing source paths (optional)
  openInEditor: true,              // Show "Open in editor" in the right-click menu
  onLocate(result) {
    console.log("Source:", result.source);  // result.source, result.mode
  },
  onError(error) {
    console.error("Error:", error);
  },
});
```

## Known Limitations

- **React Native not supported**: Relies on the DOM API.
- **Turbopack not supported**: Turbopack in Next.js 13+ is not currently supported.
- **TSX generic arrow functions**: Files containing generic arrow functions in the form `<T,>` in `.tsx` files will be skipped during transform. (`function` declarations and `.ts` files work fine.)
- **Disabled elements / blocked pointer-events**: Elements with a `disabled` attribute or `pointer-events: none` applied will not fire click events and cannot be detected.
- **CRA (Create React App)**: The webpack config is hidden, so plugin injection requires `react-app-rewired` or `craco`.
- **Dev only**: The plugin's `enabled` option defaults to `NODE_ENV === "development"`, so it is automatically disabled in production builds.

## License

MIT
