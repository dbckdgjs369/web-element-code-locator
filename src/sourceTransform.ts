import { transformAsync } from "@babel/core";
import { babelInjectComponentSource, type BabelInjectComponentSourceOptions } from "./babelInjectComponentSource";

export type SourceTransformOptions = BabelInjectComponentSourceOptions & {
  filename: string;
  sourceMaps?: boolean;
};

export async function transformSourceWithLocator(
  code: string,
  options: SourceTransformOptions,
) {
  const { filename, sourceMaps = true, ...pluginOptions } = options;
  const result = await transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps,
    parserOpts: {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    },
    generatorOpts: {
      retainLines: true,
    },
    plugins: [[babelInjectComponentSource, pluginOptions]],
  });

  return {
    code: result?.code ?? code,
    map: result?.map ?? null,
  };
}
