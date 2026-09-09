/**
 * Vite integration. Four responsibilities, none of which require the user to touch a
 * config file beyond adding this plugin:
 *
 *   Hook C — redirect `react/jsx-dev-runtime` to our wrapper via `resolveId`. Chosen over
 *            `jsxImportSource` because it needs no tsconfig change and survives a project
 *            that already points jsxImportSource at emotion or theme-ui.
 *   Hook D — push the Babel visitor into @vitejs/plugin-react's own pass through its
 *            documented `api.reactBabel` extension point. Zero extra parsing.
 *   client — inject the browser runtime as a virtual module.
 *   editor — serve /__open-in-editor.
 */

import type { Plugin } from "vite";
import babelPlugin from "../babel/plugin";
import { openInEditorMiddleware, OPEN_IN_EDITOR_PATH } from "../open-in-editor";
import type { LocatorOptions } from "../runtime";

const REACT_JSX_DEV_RUNTIME = "react/jsx-dev-runtime";
const OUR_JSX_DEV_RUNTIME = "react-code-locator/jsx-dev-runtime";

const CLIENT_ID = "virtual:react-code-locator/client";
const RESOLVED_CLIENT_ID = `\0${CLIENT_ID}`;

/**
 * Matches this package in an installed layout. Not sufficient on its own: a `file:` or
 * npm-linked install resolves through the symlink to the real checkout, whose directory
 * can be named anything — so resolveId() below also compares against the wrapper's own
 * resolved id, which is name-agnostic.
 */
const SELF_RE = /react-code-locator[\\/](dist|src)[\\/]jsx-dev-runtime/;

export interface ReactCodeLocatorOptions {
  /** Paths are reported relative to this. Defaults to Vite's `root`. */
  projectRoot?: string;
  /** Set false to wire the runtime up yourself. */
  injectClient?: boolean;
  /** Set false to skip the Babel visitor and lose component *definition* locations. */
  componentDefinitions?: boolean;
  /** Browser runtime options (trigger key, callbacks). */
  locator?: LocatorOptions;
  /** Editor CLI for the open-in-editor endpoint. */
  editor?: string;
}

export function reactCodeLocator(options: ReactCodeLocatorOptions = {}): Plugin {
  const {
    injectClient = true,
    componentDefinitions = true,
    locator = {},
    editor,
  } = options;

  let projectRoot = options.projectRoot ?? "";
  // The wrapper's resolved id, once known — the symlink-proof half of the cycle check.
  let wrapperId: string | null = null;

  return {
    name: "react-code-locator",

    // Dev only. A production build never calls jsxDEV, and jsx-runtime is a plain
    // re-export, so there is nothing to do and nothing to cost.
    apply: "serve",

    // Must beat Vite's own resolver to the bare specifier.
    enforce: "pre",

    // @vitejs/plugin-react collects this from every plugin in the graph and calls it with
    // the Babel options it is about to use. This is the supported way in; mutating the
    // plugin's own options object from `config()` would not work, since it closes over them.
    api: {
      reactBabel(babelOptions: { plugins: unknown[] }) {
        if (!componentDefinitions) return;
        babelOptions.plugins.push([babelPlugin, { projectRoot }]);
      },
    },

    config() {
      return {
        optimizeDeps: {
          // Our wrapper must not be pre-bundled apart from the React copy it wraps, or the
          // registry ends up split across two module instances.
          exclude: [OUR_JSX_DEV_RUNTIME],
        },
      };
    },

    configResolved(config) {
      projectRoot = projectRoot || config.root;
    },

    async resolveId(id, importer, resolveOptions) {
      if (id === CLIENT_ID) return RESOLVED_CLIENT_ID;
      if (id !== REACT_JSX_DEV_RUNTIME) return null;

      // Let our own wrapper reach the real React runtime — this breaks the cycle.
      if (importer && (SELF_RE.test(importer) || importer === wrapperId)) return null;

      const resolved = await this.resolve(OUR_JSX_DEV_RUNTIME, importer, {
        ...resolveOptions,
        skipSelf: true,
      });
      if (resolved?.id) wrapperId = resolved.id;
      return resolved?.id ?? null;
    },

    load(id) {
      if (id !== RESOLVED_CLIENT_ID) return null;
      const serialized = JSON.stringify({ projectRoot, openInEditor: true, ...locator });
      return `import { enableLocator } from "react-code-locator/runtime";\nenableLocator(${serialized});\n`;
    },

    configureServer(server) {
      const handler = openInEditorMiddleware({ editor, projectRoot });
      server.middlewares.use(OPEN_IN_EDITOR_PATH, (req, res) => handler(req, res));
    },

    transformIndexHtml() {
      if (!injectClient) return;
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `/@id/__x00__${CLIENT_ID}` },
          injectTo: "head" as const,
        },
      ];
    },
  };
}

export default reactCodeLocator;
