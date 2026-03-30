import {
  JSX_SOURCE_PROP,
  JSX_SOURCE_REGISTRY_SYMBOL,
  SOURCE_PROP,
} from "./constants";
import { getSourceFile, isProjectLocalSource } from "./sourceMetadata";

export type TriggerKey = "alt" | "meta" | "ctrl" | "shift" | "none";
export type LocatorMode = "screen" | "implementation";

type ReactFiber = {
  return?: ReactFiber | null;
  type?: unknown;
  elementType?: unknown;
  pendingProps?: Record<string, unknown> | null;
  memoizedProps?: Record<string, unknown> | null;
  _debugOwner?: ReactFiber | null;
  _debugSource?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  } | null;
};

export type LocatorResult = {
  source: string;
  mode: LocatorMode;
};

export type LocatorOptions = {
  triggerKey?: TriggerKey;
  onLocate?: (result: LocatorResult) => void;
  onError?: (error: unknown) => void;
  projectRoot?: string;
  enabled?: boolean;
  /**
   * Automatically open the source file in your editor on locate.
   * Requires a `/__open-in-editor` endpoint on the dev server.
   * - Vite: built-in, no extra setup needed.
   * - Webpack/Rspack: add `openInEditorMiddleware()` to devServer.
   */
  openInEditor?: boolean;
};


function isTriggerPressed(event: MouseEvent, triggerKey: TriggerKey) {
  if (triggerKey === "none") {
    return true;
  }

  if (triggerKey === "alt") {
    return event.altKey;
  }

  if (triggerKey === "meta") {
    return event.metaKey;
  }

  if (triggerKey === "ctrl") {
    return event.ctrlKey;
  }

  return event.shiftKey;
}

const fiberKeyCache = new WeakMap<Element, string | undefined>();

function getReactFiberKey(element: Element) {
  if (fiberKeyCache.has(element)) return fiberKeyCache.get(element);
  const key = Object.keys(element).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  fiberKeyCache.set(element, key);
  return key;
}

function getClosestReactFiber(target: Element | null) {
  let current = target;

  while (current) {
    const fiberKey = getReactFiberKey(current);
    if (fiberKey) {
      return (current as unknown as Record<string, unknown>)[fiberKey] as ReactFiber;
    }

    current = current.parentElement;
  }

  return null;
}

function getSourceFromType(type: unknown) {
  if (!type) {
    return null;
  }

  if (typeof type === "function") {
    const source = (type as unknown as Record<string, unknown>)[SOURCE_PROP];
    return typeof source === "string" ? source : null;
  }

  if (typeof type !== "object") {
    return null;
  }

  const record = type as {
    type?: Record<string, unknown>;
    render?: Record<string, unknown>;
    [SOURCE_PROP]?: unknown;
  };

  const source = record[SOURCE_PROP] ?? record.type?.[SOURCE_PROP] ?? record.render?.[SOURCE_PROP];
  return typeof source === "string" ? source : null;
}

function getSourceFromProps(props: Record<string, unknown> | null | undefined) {
  if (props && typeof props === "object") {
    const registry = (globalThis as Record<symbol, unknown>)[
      Symbol.for(JSX_SOURCE_REGISTRY_SYMBOL)
    ];
    if (registry instanceof WeakMap) {
      const intrinsicSource = registry.get(props as object);
      if (typeof intrinsicSource === "string") {
        return intrinsicSource;
      }
    }
  }

  const source = props?.[JSX_SOURCE_PROP];
  return typeof source === "string" ? source : null;
}

function resolveComponentSourceFromFiber(fiber: ReactFiber | null) {
  let current = fiber;

  while (current) {
    const source = getSourceFromType(current.type) ?? getSourceFromType(current.elementType);
    if (source) {
      return source;
    }

    current = current.return ?? null;
  }

  return null;
}

function getDirectDebugSource(fiber: ReactFiber | null) {
  const debugSource = fiber?._debugSource;
  if (debugSource?.fileName && typeof debugSource.lineNumber === "number") {
    return `${debugSource.fileName.replace(/\\/g, "/")}:${debugSource.lineNumber}:${debugSource.columnNumber ?? 1}`;
  }

  return null;
}

const SOURCE_PATTERN = /^(.*):(\d+):(\d+)$/;

function normalizeSource(source: string, projectRoot: string | undefined): string {
  if (!projectRoot || !source) return source;
  const match = source.match(SOURCE_PATTERN);
  if (!match) return source;
  const [, file, line, col] = match;
  const normalizedFile = file.replace(/\\/g, "/");
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalizedFile.startsWith(normalizedRoot + "/")) {
    return `${normalizedFile.slice(normalizedRoot.length + 1)}:${line}:${col}`;
  }
  return source;
}

type SourceCandidate = {
  source: string;
  file: string;
};

type ResolvedCandidates = {
  screen: string | null;
  implementation: string | null;
};

function resolveSourceCandidates(fiber: ReactFiber | null, projectRoot?: string): ResolvedCandidates {
  let current = fiber;
  const jsxCandidates: SourceCandidate[] = [];
  const componentCandidates: SourceCandidate[] = [];
  const jsxSourceSet = new Set<string>();
  const componentSourceSet = new Set<string>();

  while (current) {
    const rawJsxSource =
      getSourceFromProps(current.pendingProps) ?? getSourceFromProps(current.memoizedProps) ?? getDirectDebugSource(current);
    const jsxSource = normalizeSource(rawJsxSource ?? "", projectRoot) || rawJsxSource;
    if (jsxSource && !jsxSourceSet.has(jsxSource)) {
      const file = getSourceFile(jsxSource);
      if (file) {
        jsxSourceSet.add(jsxSource);
        jsxCandidates.push({ source: jsxSource, file });
      }
    }

    const rawComponentSource = getSourceFromType(current.type) ?? getSourceFromType(current.elementType);
    const componentSource = normalizeSource(rawComponentSource ?? "", projectRoot) || rawComponentSource;
    if (componentSource && !componentSourceSet.has(componentSource)) {
      const file = getSourceFile(componentSource);
      if (file) {
        componentSourceSet.add(componentSource);
        componentCandidates.push({ source: componentSource, file });
      }
    }

    current = current.return ?? null;
  }

  const nearestProjectLocalComponentFile = componentCandidates.find((candidate) => isProjectLocalSource(candidate.source))?.file;
  let screen: string | null = null;
  if (nearestProjectLocalComponentFile) {
    const matchingJsxCandidate = jsxCandidates.find((candidate) => candidate.file === nearestProjectLocalComponentFile);
    if (matchingJsxCandidate) {
      screen = matchingJsxCandidate.source;
    } else {
      const matchingComponentCandidate = componentCandidates.find(
        (candidate) => candidate.file === nearestProjectLocalComponentFile,
      );
      if (matchingComponentCandidate) {
        screen = matchingComponentCandidate.source;
      }
    }
  }

  const implementationComponentCandidate =
    componentCandidates.find((candidate) => !isProjectLocalSource(candidate.source))?.source ?? null;
  const implementationJsxCandidate =
    jsxCandidates.find((candidate) => !isProjectLocalSource(candidate.source))?.source ?? null;

  const projectLocalJsxCandidate = jsxCandidates.find((candidate) => isProjectLocalSource(candidate.source))?.source ?? null;
  const screenFallback = screen ?? projectLocalJsxCandidate ?? componentCandidates.find((candidate) => isProjectLocalSource(candidate.source))?.source ?? null;

  return {
    screen: screenFallback,
    implementation: implementationComponentCandidate ?? implementationJsxCandidate ?? screenFallback,
  };
}


export function locateComponentSource(target: EventTarget | null, mode: LocatorMode = "screen", projectRoot?: string): LocatorResult | null {
  const elementTarget =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const fiber = getClosestReactFiber(elementTarget);
  if (!fiber) {
    return null;
  }

  const candidates = resolveSourceCandidates(fiber, projectRoot);

  const source = candidates[mode] ?? candidates.screen ?? candidates.implementation;
  if (source) {
    return {
      source,
      mode,
    };
  }

  const componentSource = resolveComponentSourceFromFiber(fiber);
  if (!componentSource) {
    return null;
  }

  return {
    source: componentSource,
    mode,
  };
}

const locatorElements = new WeakSet<Element>();

function isLocatorElement(el: Element) {
  return locatorElements.has(el);
}

function registerLocatorElement(el: Element) {
  locatorElements.add(el);
}

function getTriggerKeyName(triggerKey: TriggerKey): string | null {
  if (triggerKey === "alt") return "Alt";
  if (triggerKey === "meta") return "Meta";
  if (triggerKey === "ctrl") return "Control";
  if (triggerKey === "shift") return "Shift";
  return null;
}

function showToast(message: string, tone: "idle" | "success" = "idle") {
  if (typeof document === "undefined") return;

  const existing = document.querySelector("[data-react-code-locator-toast]");
  existing?.remove();

  const toast = document.createElement("div");
  toast.setAttribute("data-react-code-locator-toast", "true");
  Object.assign(toast.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "2147483647",
    padding: "7px 12px",
    borderRadius: "8px",
    background: tone === "success" ? "rgba(6, 95, 70, 0.92)" : "rgba(17, 24, 39, 0.92)",
    color: "#fff",
    fontSize: "12px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.25)",
    pointerEvents: "none",
    opacity: "1",
    transition: "opacity 200ms ease",
  });

  toast.textContent = message;
  registerLocatorElement(toast);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 1800);
}

function showModeToast(mode: LocatorMode) {
  showToast(
    mode === "screen"
      ? "[react-code-locator] Screen source (Alt+1)"
      : "[react-code-locator] Implementation source (Alt+2)"
  );
}

function createHighlightOverlay() {
  if (typeof document === "undefined") return null;

  const overlay = document.createElement("div");
  registerLocatorElement(overlay);
  overlay.setAttribute("data-react-code-locator-highlight", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    zIndex: "2147483645",
    pointerEvents: "none",
    background: "rgba(59, 130, 246, 0.12)",
    outline: "2px solid rgba(59, 130, 246, 0.75)",
    outlineOffset: "-1px",
    boxSizing: "border-box",
    display: "none",
  });

  const label = document.createElement("div");
  registerLocatorElement(label);
  label.setAttribute("data-react-code-locator-label", "true");
  Object.assign(label.style, {
    position: "fixed",
    zIndex: "2147483646",
    pointerEvents: "none",
    background: "rgba(37, 99, 235, 0.92)",
    color: "#fff",
    fontSize: "11px",
    lineHeight: "1.4",
    padding: "2px 7px",
    borderRadius: "3px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    maxWidth: "min(60vw, 480px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "none",
  });

  const mount = () => {
    if (document.body) {
      document.body.appendChild(overlay);
      document.body.appendChild(label);
    }
  };

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }

  return {
    update(element: Element, source: string) {
      const rect = element.getBoundingClientRect();

      Object.assign(overlay.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        display: "block",
      });

      const shortSource = source.replace(/^.*[/\\]/, "").replace(/:(\d+):\d+$/, ":$1");
      label.textContent = shortSource;
      label.style.display = "block";

      const labelTop = rect.top - 22;
      label.style.top = labelTop >= 4 ? `${labelTop}px` : `${rect.bottom + 4}px`;
      label.style.left = `${Math.max(4, rect.left)}px`;
    },
    hide() {
      overlay.style.display = "none";
      label.style.display = "none";
    },
    remove() {
      overlay.remove();
      label.remove();
    },
  };
}

function createContextMenu() {
  let currentMenu: HTMLElement | null = null;

  const dismiss = () => {
    currentMenu?.remove();
    currentMenu = null;
    document.removeEventListener("click", dismiss, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") dismiss();
  };

  const show = (x: number, y: number, source: string, onOpen: (() => void) | null) => {
    dismiss();

    const menu = document.createElement("div");
    registerLocatorElement(menu);
    menu.setAttribute("data-react-code-locator-menu", "true");
    Object.assign(menu.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      zIndex: "2147483647",
      background: "rgba(17, 24, 39, 0.96)",
      borderRadius: "6px",
      padding: "4px 0",
      boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "12px",
      color: "#fff",
      minWidth: "160px",
    });

    const makeItem = (label: string, onClick: () => void) => {
      const item = document.createElement("div");
      item.textContent = label;
      Object.assign(item.style, {
        padding: "7px 14px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      });
      item.addEventListener("mouseenter", () => {
        item.style.background = "rgba(255, 255, 255, 0.1)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "";
      });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
        dismiss();
      });
      return item;
    };

    if (onOpen) {
      menu.appendChild(makeItem("Open in editor", onOpen));
    }

    const copyItem = makeItem("Copy path", async () => {
      try {
        await navigator.clipboard.writeText(source);
        showToast("[react-code-locator] Copied!", "success");
      } catch {
        showToast("[react-code-locator] Copy failed", "idle");
      }
    });
    menu.appendChild(copyItem);

    document.body.appendChild(menu);
    currentMenu = menu;

    requestAnimationFrame(() => {
      if (!currentMenu) return;
      const rect = currentMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        currentMenu.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        currentMenu.style.top = `${y - rect.height}px`;
      }
    });

    setTimeout(() => {
      document.addEventListener("click", dismiss, true);
      document.addEventListener("keydown", onKeyDown, true);
    }, 0);
  };

  return { show, dismiss };
}

export function enableReactComponentJump(options: LocatorOptions = {}) {
  const enabled = options.enabled ?? true;
  if (!enabled) return;
  const contextMenu = createContextMenu();
  const highlight = createHighlightOverlay();
  let currentMode: LocatorMode = "screen";
  const {
    triggerKey = "shift",
    projectRoot,
    openInEditor = false,
    onLocate,
    onError,
  } = options;

  const triggerKeyName = getTriggerKeyName(triggerKey);
  let triggerActive = triggerKey === "none";
  let rafId: number | null = null;
  let lastLocateResult: { target: Element; mode: LocatorMode; result: LocatorResult } | null = null;

  const handleLocate = onLocate ?? ((result: LocatorResult) => {
    console.log(`[react-code-locator] ${result.source}`);
  });

  const handleError = onError ?? ((error: unknown) => {
    console.error("[react-code-locator]", error);
  });

  const keyDownHandler = (event: KeyboardEvent) => {
    if (event.altKey) {
      if (event.code === "Digit1") {
        currentMode = "screen";
        showModeToast(currentMode);
        event.preventDefault();
        return;
      }
      if (event.code === "Digit2") {
        currentMode = "implementation";
        showModeToast(currentMode);
        event.preventDefault();
        return;
      }
    }

    if (triggerKeyName && event.key === triggerKeyName && !triggerActive) {
      triggerActive = true;
    }
  };

  const keyUpHandler = (event: KeyboardEvent) => {
    if (triggerKeyName && event.key === triggerKeyName) {
      triggerActive = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      highlight?.hide();
    }
  };

  const mouseMoveHandler = (event: MouseEvent) => {
    if (!triggerActive) return;
    if (rafId !== null) return;

    const target = event.target;
    rafId = requestAnimationFrame(() => {
      rafId = null;

      const elementTarget =
        target instanceof Element
          ? target
          : target instanceof Node
            ? (target as Node).parentElement
            : null;

      if (!elementTarget || isLocatorElement(elementTarget)) {
        highlight?.hide();
        return;
      }

      const result = locateComponentSource(target, currentMode, projectRoot);
      if (!result) {
        highlight?.hide();
        return;
      }

      lastLocateResult = { target: elementTarget, mode: currentMode, result };
      highlight?.update(elementTarget, result.source);
    });
  };

  const handler = (event: MouseEvent) => {
    if (!isTriggerPressed(event, triggerKey)) {
      return;
    }

    const elementTarget =
      event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? (event.target as Node).parentElement
          : null;

    const result =
      lastLocateResult?.target === elementTarget && lastLocateResult.mode === currentMode
        ? lastLocateResult.result
        : locateComponentSource(event.target, currentMode, projectRoot);

    if (!result) {
      handleError(new Error("No React component source metadata found for clicked element."));
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleLocate(result);
  };

  const contextMenuHandler = (event: MouseEvent) => {
    if (!triggerActive) return;

    const elementTarget =
      event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? (event.target as Node).parentElement
          : null;

    if (elementTarget && isLocatorElement(elementTarget)) return;

    const result =
      lastLocateResult?.target === elementTarget && lastLocateResult.mode === currentMode
        ? lastLocateResult.result
        : locateComponentSource(event.target, currentMode, projectRoot);

    if (!result) return;

    event.preventDefault();
    event.stopPropagation();
    highlight?.hide();

    const onOpen = openInEditor
      ? () => fetch(`/__open-in-editor?file=${encodeURIComponent(result.source)}`).catch(() => {})
      : null;

    contextMenu.show(event.clientX, event.clientY, result.source, onOpen);
  };

  document.addEventListener("click", handler, true);
  document.addEventListener("keydown", keyDownHandler, true);
  document.addEventListener("keyup", keyUpHandler, true);
  document.addEventListener("mousemove", mouseMoveHandler, true);
  document.addEventListener("contextmenu", contextMenuHandler, true);

  return () => {
    document.removeEventListener("click", handler, true);
    document.removeEventListener("keydown", keyDownHandler, true);
    document.removeEventListener("keyup", keyUpHandler, true);
    document.removeEventListener("mousemove", mouseMoveHandler, true);
    document.removeEventListener("contextmenu", contextMenuHandler, true);
    contextMenu.dismiss();
    highlight?.remove();
  };
}
