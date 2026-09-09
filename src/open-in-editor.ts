/**
 * Dev-server endpoint that opens a `file:line:column` in the user's editor.
 *
 * Node-only. Kept out of anything the browser bundle can reach.
 */

import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DEFAULT_EDITOR, EDITOR_APP_NAMES, buildEditorArgs, parseFileLocation } from "./editors";

export const OPEN_IN_EDITOR_PATH = "/__open-in-editor";

export interface OpenInEditorOptions {
  /** CLI command. Defaults to $REACT_CODE_LOCATOR_EDITOR, then $EDITOR, then `code`. */
  editor?: string;
  /** Relative paths are resolved against this. Defaults to process.cwd(). */
  projectRoot?: string;
}

function resolveEditor(explicit?: string): string {
  return (
    explicit ||
    process.env.REACT_CODE_LOCATOR_EDITOR ||
    process.env.EDITOR ||
    DEFAULT_EDITOR
  );
}

export function openInEditor(source: string, options: OpenInEditorOptions = {}): void {
  const root = options.projectRoot ?? process.cwd();
  const editor = resolveEditor(options.editor);

  const { filePath, line, col } = parseFileLocation(source);
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  const args = buildEditorArgs(editor, absolute, line, col);

  try {
    spawn(editor, args, { stdio: "ignore", detached: true }).unref();
  } catch (error) {
    console.error(`[react-code-locator] could not open "${absolute}": ${String(error)}`);
    return;
  }

  // Spawning the CLI opens the file but leaves the window behind the browser.
  if (process.platform === "darwin") {
    const appName = EDITOR_APP_NAMES[editor.replace(/64$/, "")];
    if (appName) spawnSync("open", ["-a", appName]);
  }
}

/** Connect/Express-compatible handler, for webpack devServer and Next custom servers. */
export function openInEditorMiddleware(options: OpenInEditorOptions = {}) {
  return function handler(req: { url?: string }, res: { statusCode: number; end: (body?: string) => void }) {
    let source: string | null = null;
    try {
      const url = new URL(req.url ?? "", "http://localhost");
      source = url.searchParams.get("file");
    } catch {
      /* falls through to the 400 below */
    }

    if (!source) {
      res.statusCode = 400;
      res.end('react-code-locator: missing "file" query parameter');
      return;
    }

    openInEditor(source, options);
    res.end();
  };
}
