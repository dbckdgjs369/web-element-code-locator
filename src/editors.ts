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

/**
 * macOS에서 open -a 로 포커스할 때 사용하는 앱 이름 매핑
 */
export const EDITOR_APP_NAMES: Partial<Record<SupportedEditor, string>> = {
  "code": "Visual Studio Code",
  "code-insiders": "Visual Studio Code - Insiders",
  "codium": "VSCodium",
  "vscodium": "VSCodium",
  "cursor": "Cursor",
  "webstorm": "WebStorm",
  "webstorm64": "WebStorm",
  "idea": "IntelliJ IDEA",
  "idea64": "IntelliJ IDEA",
  "goland": "GoLand",
  "goland64": "GoLand",
  "pycharm": "PyCharm",
  "pycharm64": "PyCharm",
  "phpstorm": "PhpStorm",
  "phpstorm64": "PhpStorm",
  "rubymine": "RubyMine",
  "rubymine64": "RubyMine",
  "clion": "CLion",
  "clion64": "CLion",
  "rider": "Rider",
  "rider64": "Rider",
  "zed": "Zed",
  "atom": "Atom",
  "subl": "Sublime Text",
  "sublime_text": "Sublime Text",
};
