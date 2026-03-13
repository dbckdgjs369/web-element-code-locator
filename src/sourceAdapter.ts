export type SourceInjectionOptions = {
  injectJsxSource?: boolean;
  injectComponentSource?: boolean;
  projectRoot?: string;
};

export type SourceAdapterKind = "babel" | "vite" | "esbuild" | "swc";

export type SourceAdapterDescriptor<TConfig = unknown, TOptions = SourceInjectionOptions> = {
  kind: SourceAdapterKind;
  name: string;
  options: TOptions;
  config: TConfig;
};

export function defineSourceAdapter<TConfig = unknown, TOptions = SourceInjectionOptions>(
  descriptor: SourceAdapterDescriptor<TConfig, TOptions>,
) {
  return descriptor;
}
