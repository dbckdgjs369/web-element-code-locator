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
  /**
   * CLI command. Defaults to $REACT_CODE_LOCATOR_EDITOR, then $VISUAL/$EDITOR (unless they
   * name a terminal editor), then whatever GUI editor is currently running, then `code`.
   */
  editor?: string;
  /** Relative paths are resolved against this. Defaults to process.cwd(). */
  projectRoot?: string;
}

/**
 * $EDITOR conventionally holds a terminal editor (it exists so git can open commit
 * messages in your shell). Spawned detached from a dev server there is no TTY to draw
 * on, so vi "opens" into the void and the user sees nothing at all — the exact bug this
 * chain exists to avoid. Honored only when named explicitly.
 */
const TERMINAL_EDITORS = new Set([
  "vi", "vim", "nvim", "nano", "pico", "micro", "emacs", "emacsclient", "ed", "joe",
  "hx", "helix", "kak",
]);

/** macOS `ps` reports the full bundle path; first match wins, so Insiders precedes stable. */
const MAC_RUNNING_APP_HINTS: Array<[hint: string, cli: string]> = [
  ["Visual Studio Code - Insiders.app", "code-insiders"],
  ["Visual Studio Code.app", "code"],
  ["VSCodium.app", "codium"],
  ["Cursor.app", "cursor"],
  ["Windsurf.app", "windsurf"],
  ["Zed.app", "zed"],
  ["WebStorm.app", "webstorm"],
  ["IntelliJ IDEA.app", "idea"],
  ["PyCharm.app", "pycharm"],
  ["PhpStorm.app", "phpstorm"],
  ["GoLand.app", "goland"],
  ["Rider.app", "rider"],
  ["CLion.app", "clion"],
  ["RubyMine.app", "rubymine"],
  ["Sublime Text.app", "subl"],
];

/** On Linux the process name IS the CLI name (sublime_text opens files itself). */
const LINUX_RUNNING_BINARIES = new Set([
  "code-insiders", "code", "codium", "cursor", "windsurf", "zed", "webstorm", "idea",
  "pycharm", "phpstorm", "goland", "rider", "clion", "rubymine", "sublime_text",
]);

function detectRunningEditor(): string | null {
  try {
    const out = spawnSync("ps", ["x", "-o", "comm="], { encoding: "utf8" }).stdout ?? "";
    if (process.platform === "darwin") {
      for (const [hint, cli] of MAC_RUNNING_APP_HINTS) {
        if (out.includes(hint)) return cli;
      }
      return null;
    }
    for (const line of out.split("\n")) {
      const name = path.basename(line.trim());
      if (LINUX_RUNNING_BINARIES.has(name)) return name === "sublime_text" ? "subl" : name;
    }
  } catch {
    /* ps unavailable — fall through to the default */
  }
  return null;
}

let loggedChoice = false;

function resolveEditor(explicit?: string): string {
  const named = explicit || process.env.REACT_CODE_LOCATOR_EDITOR;
  if (named) return named;

  for (const envVar of ["VISUAL", "EDITOR"] as const) {
    const value = process.env[envVar];
    if (!value) continue;
    const command = value.trim().split(/\s+/)[0];
    if (command && !TERMINAL_EDITORS.has(path.basename(command))) return command;
  }

  const editor = detectRunningEditor() ?? DEFAULT_EDITOR;
  if (!loggedChoice) {
    loggedChoice = true;
    console.log(
      `[react-code-locator] opening files with "${editor}"` +
        " (set REACT_CODE_LOCATOR_EDITOR to override)",
    );
  }
  return editor;
}

export function openInEditor(source: string, options: OpenInEditorOptions = {}): void {
  const root = options.projectRoot ?? process.cwd();
  const editor = resolveEditor(options.editor);

  const { filePath, line, col } = parseFileLocation(source);
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  const args = buildEditorArgs(editor, absolute, line, col);

  // ENOENT arrives as an async "error" event, not a throw — without the listener a
  // missing CLI (e.g. `code` never installed to PATH) fails with no output anywhere.
  const child = spawn(editor, args, { stdio: "ignore", detached: true });
  child.on("error", (error) => {
    console.error(
      `[react-code-locator] could not launch "${editor}" for "${absolute}": ${String(error)}` +
        " — set REACT_CODE_LOCATOR_EDITOR to an editor CLI on your PATH",
    );
  });
  child.unref();

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
