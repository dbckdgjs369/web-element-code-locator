import type { Plugin, PluginOption } from "vite";
import type { LocatorOptions } from "./runtime";

const VIRTUAL_CLIENT_MODULE_ID = "virtual:react-code-locator/client";
const RESOLVED_VIRTUAL_CLIENT_MODULE_ID = `\0${VIRTUAL_CLIENT_MODULE_ID}`;

export type ViteClientInjectorOptions = {
  locator?: LocatorOptions;
  injectClient?: boolean;
  projectRoot?: string;
};

function createClientInjector(locatorOptions: LocatorOptions = {}, projectRoot?: string): Plugin {
  const serialized = JSON.stringify({ ...locatorOptions, projectRoot });

  return {
    name: "react-code-locator-client-injector",
    apply: "serve",
    resolveId(id) {
      if (id === VIRTUAL_CLIENT_MODULE_ID) {
        return RESOLVED_VIRTUAL_CLIENT_MODULE_ID;
      }

      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_CLIENT_MODULE_ID) {
        return null;
      }

      return `
        import { enableReactComponentJump } from "react-code-locator";

        enableReactComponentJump(${serialized});
      `;
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: {
            type: "module",
            src: `/@id/__x00__${VIRTUAL_CLIENT_MODULE_ID}`,
          },
          injectTo: "head",
        },
      ];
    },
  };
}

export function createViteClientInjector(
  options: ViteClientInjectorOptions = {},
): PluginOption[] {
  const { locator = {}, injectClient = true, projectRoot } = options;

  return [injectClient ? createClientInjector(locator, projectRoot) : null].filter(Boolean);
}
