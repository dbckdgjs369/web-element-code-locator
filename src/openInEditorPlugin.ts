import path from "node:path";
import { spawnSync } from "node:child_process";
import { EDITOR_APP_NAMES } from "./editors";

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
    launchEditor(resolved, editor, (fileName, errorMessage) => {
      console.error(`[react-code-locator] Failed to open "${fileName}" in editor: ${errorMessage}`);
    });

    if (process.platform === "darwin" && editor) {
      const appName = EDITOR_APP_NAMES[editor as keyof typeof EDITOR_APP_NAMES];
      if (appName) {
        spawnSync("open", ["-a", appName]);
      }
    }

    res.end();
  };
}
