import type { Plugin, PluginOption } from "vite";
import { type LocatorOptions } from "./runtime";

const VIRTUAL_CLIENT_MODULE_ID = "virtual:react-code-locator/client";
const RESOLVED_VIRTUAL_CLIENT_MODULE_ID = `\0${VIRTUAL_CLIENT_MODULE_ID}`;

export type ElementLocatorReactOptions = {
  command?: "serve" | "build";
  locator?: LocatorOptions;
  injectClient?: boolean;
};

function createClientInjector(locatorOptions: LocatorOptions = {}): Plugin {
  const serialized = JSON.stringify(locatorOptions);

  return {
    name: "element-locator-client-injector",
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
        import { enableReactComponentJump } from "react-code-locator/client";

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

export function elementLocatorReact(options: ElementLocatorReactOptions = {}): PluginOption[] {
  const { command = "serve", locator = {}, injectClient = true } = options;
  const isServe = command === "serve";

  return [isServe && injectClient ? createClientInjector(locator) : null].filter(Boolean);
}
