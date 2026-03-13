import { readFile } from "node:fs/promises";
import { defineSourceAdapter, type SourceInjectionOptions } from "./sourceAdapter";
import { transformSourceWithLocator } from "./sourceTransform";

type EsbuildOnLoadResult = {
  contents: string;
  loader: "js" | "jsx" | "ts" | "tsx";
};

type EsbuildPluginBuild = {
  onLoad: (
    options: { filter: RegExp },
    callback: (args: { path: string }) => Promise<EsbuildOnLoadResult | null>,
  ) => void;
};

export type EsbuildPlugin = {
  name: string;
  setup: (build: EsbuildPluginBuild) => void;
};

export type EsbuildSourceAdapterConfig = {
  plugins: EsbuildPlugin[];
};

function getEsbuildLoader(filename: string): EsbuildOnLoadResult["loader"] {
  if (filename.endsWith(".tsx")) {
    return "tsx";
  }

  if (filename.endsWith(".ts")) {
    return "ts";
  }

  if (filename.endsWith(".jsx")) {
    return "jsx";
  }

  return "js";
}

export function esbuildSourceTransformPlugin(
  options: SourceInjectionOptions = {},
): EsbuildPlugin {
  return {
    name: "react-code-locator-source-transform",
    setup(build) {
      build.onLoad({ filter: /\.[mc]?[jt]sx?$/ }, async ({ path }) => {
        if (path.includes("/node_modules/")) {
          return null;
        }

        const code = await readFile(path, "utf8");
        const result = await transformSourceWithLocator(code, {
          filename: path,
          ...options,
        });

        return {
          contents: result.code,
          loader: getEsbuildLoader(path),
        };
      });
    },
  };
}

export function createEsbuildSourceAdapter(options: SourceInjectionOptions = {}) {
  return defineSourceAdapter<EsbuildSourceAdapterConfig>({
    kind: "esbuild",
    name: "react-code-locator/esbuild",
    options,
    config: {
      plugins: [esbuildSourceTransformPlugin(options)],
    },
  });
}

export const esbuildSourceAdapter = createEsbuildSourceAdapter();
