/**
 * Editor CLI invocation. Every editor listed here can open a file at a line and column.
 */

export const DEFAULT_EDITOR = "code";

/** macOS needs an explicit `open -a` to pull the editor window to the front. */
export const EDITOR_APP_NAMES: Record<string, string> = {
  code: "Visual Studio Code",
  "code-insiders": "Visual Studio Code - Insiders",
  codium: "VSCodium",
  vscodium: "VSCodium",
  cursor: "Cursor",
  windsurf: "Windsurf",
  zed: "Zed",
  webstorm: "WebStorm",
  idea: "IntelliJ IDEA",
  goland: "GoLand",
  pycharm: "PyCharm",
  phpstorm: "PhpStorm",
  rubymine: "RubyMine",
  clion: "CLion",
  rider: "Rider",
  subl: "Sublime Text",
  sublime_text: "Sublime Text",
  atom: "Atom",
};

const VSCODE_LIKE = ["code", "code-insiders", "codium", "vscodium", "cursor", "windsurf"];
const JETBRAINS = [
  "webstorm",
  "idea",
  "goland",
  "pycharm",
  "phpstorm",
  "rubymine",
  "clion",
  "rider",
];

export function parseFileLocation(value: string): {
  filePath: string;
  line: number;
  col: number;
} {
  const full = value.match(/^(.*):(\d+):(\d+)$/);
  if (full) {
    return { filePath: full[1], line: Number(full[2]), col: Number(full[3]) };
  }
  const lineOnly = value.match(/^(.*):(\d+)$/);
  if (lineOnly) {
    return { filePath: lineOnly[1], line: Number(lineOnly[2]), col: 1 };
  }
  return { filePath: value, line: 1, col: 1 };
}

export function buildEditorArgs(
  editor: string,
  filePath: string,
  line: number,
  col: number,
): string[] {
  const base = editor.replace(/64$/, "");

  if (VSCODE_LIKE.includes(base)) return ["--goto", `${filePath}:${line}:${col}`];
  if (JETBRAINS.includes(base)) return ["--line", String(line), filePath];
  if (base === "subl" || base === "sublime_text" || base === "zed") {
    return [`${filePath}:${line}:${col}`];
  }
  if (base === "atom") return [`${filePath}:${line}`];
  if (base === "emacs" || base === "emacsclient") return [`+${line}:${col}`, filePath];
  if (base === "vim" || base === "mvim") return [`+${line}`, filePath];
  return [filePath];
}
