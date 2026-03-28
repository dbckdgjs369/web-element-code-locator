import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launchEditor = require("launch-editor") as (
  file: string,
  specifiedEditor?: string,
  onErrorCallback?: (fileName: string, errorMessage: string) => void,
) => void;

/**
 * Express-compatible middleware that opens files in the editor.
 * Add this to your webpack/rspack devServer to enable openInEditor support.
 *
 * @example
 * // webpack.config.js
 * const { openInEditorMiddleware } = require("react-code-locator");
 *
 * module.exports = {
 *   devServer: {
 *     setupMiddlewares(middlewares) {
 *       middlewares.unshift({
 *         name: "open-in-editor",
 *         path: "/__open-in-editor",
 *         middleware: openInEditorMiddleware(),
 *       });
 *       return middlewares;
 *     },
 *   },
 * };
 */
export function openInEditorMiddleware(editor?: string, srcRoot?: string) {
  const root = srcRoot ?? process.cwd();

  return function (req: any, res: any) {
    let url: URL;
    try {
      url = new URL(req.url.startsWith("http") ? req.url : `http://localhost${req.url}`);
    } catch {
      res.statusCode = 500;
      res.end("react-code-locator: invalid URL.");
      return;
    }

    const file = url.searchParams.get("file");
    if (!file) {
      res.statusCode = 500;
      res.end('react-code-locator: required query param "file" is missing.');
      return;
    }

    const resolved = file.startsWith("file://") ? file : path.resolve(root, file);
    launchEditor(resolved, editor);
    res.end();
  };
}
