const path = require("node:path");

type WebpackAdapterOptions = {
  env?: "development" | "production" | string;
};

type Rule = {
  oneOf?: Rule[];
  use?: Array<{ loader?: string; options?: { plugins?: unknown[] } }>;
  loader?: string;
  options?: { plugins?: unknown[] };
};

type WebpackConfig = {
  entry?: string | string[] | Record<string, string | string[]>;
  module?: {
    rules?: Rule[];
  };
};

function injectEntry(entry: WebpackConfig["entry"], runtimeEntry: string) {
  if (!entry) {
    return entry;
  }

  if (typeof entry === "string") {
    return [runtimeEntry, entry];
  }

  if (Array.isArray(entry)) {
    return [runtimeEntry, ...entry];
  }

  return Object.fromEntries(
    Object.entries(entry).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, [runtimeEntry, ...value]];
      }

      return [key, [runtimeEntry, value]];
    }),
  );
}

function patchRules(rules: Rule[] | undefined, babelPluginPath: string) {
  if (!rules) {
    return;
  }

  for (const rule of rules) {
    if (rule.oneOf) {
      patchRules(rule.oneOf, babelPluginPath);
    }

    if (rule.loader?.includes("babel-loader")) {
      rule.options = {
        ...(rule.options ?? {}),
        plugins: [...(rule.options?.plugins ?? []), babelPluginPath],
      };
    }

    if (rule.use) {
      rule.use = rule.use.map((useEntry) => {
        if (!useEntry.loader?.includes("babel-loader")) {
          return useEntry;
        }

        return {
          ...useEntry,
          options: {
            ...(useEntry.options ?? {}),
            plugins: [...(useEntry.options?.plugins ?? []), babelPluginPath],
          },
        };
      });
    }
  }
}

function withReactComponentJump(config: WebpackConfig, options: WebpackAdapterOptions = {}) {
  const { env = process.env.NODE_ENV ?? "development" } = options;
  if (env !== "development") {
    return config;
  }

  const babelPluginPath = path.join(__dirname, "babelInjectComponentSource.cjs");
  const runtimeEntry = path.join(__dirname, "webpackRuntimeEntry.cjs");

  patchRules(config.module?.rules, babelPluginPath);
  config.entry = injectEntry(config.entry, runtimeEntry);
  return config;
}

module.exports = {
  withReactComponentJump,
};
