// eslint-disable-next-line @typescript-eslint/no-require-imports
const launchEditorMiddleware = require("launch-editor-middleware") as (
  specifiedEditor?: string,
  srcRoot?: string,
  onErrorCallback?: (fileName: string, errorMessage: string) => void,
) => (req: any, res: any) => void;

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
  return launchEditorMiddleware(editor, srcRoot ?? process.cwd());
}
