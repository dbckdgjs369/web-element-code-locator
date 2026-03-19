/**
 * esbuild Plugin for react-code-locator
 * Uses acorn-based transform (zero-dependency)
 */

import { readFile } from "node:fs/promises";
import { transformSource, type TransformOptions } from "./core/transform";

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

export interface EsbuildSourceAdapterConfig {
  plugins: EsbuildPlugin[];
}

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

export interface EsbuildSourceAdapterOptions extends Omit<TransformOptions, 'filename'> {
  projectRoot?: string;
  injectComponentSource?: boolean;
  injectJsxSource?: boolean;
}

export function esbuildSourceTransformPlugin(
  options: EsbuildSourceAdapterOptions = {},
): EsbuildPlugin {
  const {
    projectRoot = process.cwd(),
    injectComponentSource = true,
    injectJsxSource = true,
  } = options;

  return {
    name: "react-code-locator-source-transform",
    setup(build) {
      build.onLoad({ filter: /\.[mc]?[jt]sx?$/ }, async ({ path }) => {
        if (path.includes("/node_modules/")) {
          return null;
        }

        const code = await readFile(path, "utf8");
        const result = transformSource(code, {
          filename: path,
          projectRoot,
          injectComponentSource,
          injectJsxSource,
        });

        return {
          contents: result ? result.code : code,
          loader: getEsbuildLoader(path),
        };
      });
    },
  };
}

export function createEsbuildSourceAdapter(options: EsbuildSourceAdapterOptions = {}) {
  const resolvedOptions = {
    projectRoot: process.cwd(),
    injectComponentSource: true,
    injectJsxSource: true,
    ...options,
  };

  return {
    kind: "esbuild" as const,
    name: "react-code-locator/esbuild",
    options: resolvedOptions,
    config: {
      plugins: [esbuildSourceTransformPlugin(resolvedOptions)],
    },
  };
}

export const esbuildSourceAdapter = createEsbuildSourceAdapter();
