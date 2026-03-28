/**
 * Supported editor CLI commands for openInEditor.
 * These editors support opening files at a specific line and column.
 */
export const SUPPORTED_EDITORS = [
  // VS Code 계열
  "code",
  "code-insiders",
  "codium",
  "vscodium",
  // Cursor
  "cursor",
  // JetBrains 계열
  "webstorm",
  "webstorm64",
  "idea",
  "idea64",
  "goland",
  "goland64",
  "pycharm",
  "pycharm64",
  "phpstorm",
  "phpstorm64",
  "rubymine",
  "rubymine64",
  "clion",
  "clion64",
  "rider",
  "rider64",
  // 기타
  "atom",
  "subl",
  "sublime_text",
  "zed",
  "emacs",
  "emacsclient",
  "vim",
  "mvim",
  "mate",
] as const;

export type SupportedEditor = (typeof SUPPORTED_EDITORS)[number];

export const DEFAULT_EDITOR: SupportedEditor = "code";
