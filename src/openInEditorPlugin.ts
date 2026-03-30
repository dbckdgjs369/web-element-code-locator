import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { EDITOR_APP_NAMES, DEFAULT_EDITOR } from "./editors";

function parseFileLocation(file: string): { filePath: string; line: number; col: number } {
  const match = file.match(/^(.*):(\d+):(\d+)$/);
  if (match) {
    return { filePath: match[1], line: parseInt(match[2], 10), col: parseInt(match[3], 10) };
  }
  const lineOnly = file.match(/^(.*):(\d+)$/);
  if (lineOnly) {
    return { filePath: lineOnly[1], line: parseInt(lineOnly[2], 10), col: 1 };
  }
  return { filePath: file, line: 1, col: 1 };
}

function buildEditorArgs(editor: string, filePath: string, line: number, col: number): string[] {
  // VS Code 계열
  if (["code", "code-insiders", "codium", "vscodium", "cursor"].includes(editor)) {
    return ["--goto", `${filePath}:${line}:${col}`];
  }

  // JetBrains 계열
  if (["webstorm", "webstorm64", "idea", "idea64", "goland", "goland64",
       "pycharm", "pycharm64", "phpstorm", "phpstorm64", "rubymine", "rubymine64",
       "clion", "clion64", "rider", "rider64"].includes(editor)) {
    return ["--line", String(line), filePath];
  }

  // Sublime Text
  if (["subl", "sublime_text"].includes(editor)) {
    return [`${filePath}:${line}:${col}`];
  }

  // Atom
  if (editor === "atom") {
    return [`${filePath}:${line}`];
  }

  // Zed
  if (editor === "zed") {
    return [`${filePath}:${line}:${col}`];
  }

  // Emacs / emacsclient
  if (editor === "emacs" || editor === "emacsclient") {
    return [`+${line}:${col}`, filePath];
  }

  // Vim / MacVim
  if (editor === "vim" || editor === "mvim") {
    return [`+${line}`, filePath];
  }

  // TextMate
  if (editor === "mate") {
    return [filePath];
  }

  // fallback
  return [filePath];
}

function spawnEditor(file: string, editor: string): void {
  const { filePath, line, col } = parseFileLocation(file);
  const args = buildEditorArgs(editor, filePath, line, col);

  spawn(editor, args, { stdio: "ignore", detached: true }).unref();
}

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
  const resolvedEditor = editor ?? DEFAULT_EDITOR;

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

    try {
      spawnEditor(resolved, resolvedEditor);
    } catch (err) {
      console.error(`[react-code-locator] Failed to open "${resolved}" in editor: ${err}`);
    }

    if (process.platform === "darwin") {
      const appName = EDITOR_APP_NAMES[resolvedEditor as keyof typeof EDITOR_APP_NAMES];
      if (appName) {
        spawnSync("open", ["-a", appName]);
      }
    }

    res.end();
  };
}
