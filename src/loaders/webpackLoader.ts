import { transformSource } from "../core/transform";

// Webpack loader — transforms JSX/TSX to inject source location metadata
export default function reactCodeLocatorLoader(this: any, source: string) {
  const options = this.getOptions?.() ?? {};
  const { projectRoot, injectComponentSource = true, injectJsxSource = true } = options;

  const result = transformSource(source, {
    filename: this.resourcePath,
    projectRoot,
    injectComponentSource,
    injectJsxSource,
  });

  if (!result) return source;
  return result.code;
}
