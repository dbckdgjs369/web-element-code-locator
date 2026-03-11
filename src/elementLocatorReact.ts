import type { TransformOptions, PluginItem } from "@babel/core";
import react, { type Options as ReactOptions } from "@vitejs/plugin-react";
import type { Plugin, PluginOption } from "vite";
import { babelInjectComponentSource } from "./babelInjectComponentSource";
import { type LocatorOptions } from "./runtime";

export type ElementLocatorReactOptions = {
  command?: "serve" | "build";
  react?: ReactOptions;
  locator?: LocatorOptions;
  injectClient?: boolean;
};

function withLocatorBabel(reactOptions: ReactOptions = {}): ReactOptions {
  const baseBabel = reactOptions.babel;

  if (typeof baseBabel === "function") {
    return {
      ...reactOptions,
      babel(id, options) {
        const result = baseBabel(id, options);
        const resolved = (result ?? {}) as TransformOptions;
        const plugins = [...(resolved.plugins ?? []), babelInjectComponentSource as PluginItem];

        return {
          ...resolved,
          plugins,
        };
      },
    };
  }

  const resolved = (baseBabel ?? {}) as TransformOptions;
  return {
    ...reactOptions,
    babel: {
      ...resolved,
      plugins: [...(resolved.plugins ?? []), babelInjectComponentSource as PluginItem],
    },
  };
}

function createClientInjector(locatorOptions: LocatorOptions = {}): Plugin {
  const serialized = JSON.stringify(locatorOptions);

  return {
    name: "element-locator-client-injector",
    apply: "serve",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: {
            type: "module",
          },
          children: `import { enableReactComponentJump } from "react-component-jump/client"; enableReactComponentJump(${serialized});`,
          injectTo: "head",
        },
      ];
    },
  };
}

export function elementLocatorReact(options: ElementLocatorReactOptions = {}): PluginOption[] {
  const { command = "serve", react: reactOptions, locator = {}, injectClient = true } = options;
  const isServe = command === "serve";

  return [
    react(isServe ? withLocatorBabel(reactOptions) : reactOptions),
    isServe && injectClient ? createClientInjector(locator) : null,
  ].filter(Boolean);
}
