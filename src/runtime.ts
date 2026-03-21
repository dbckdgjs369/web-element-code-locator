import {
  JSX_SOURCE_PROP,
  JSX_SOURCE_REGISTRY_SYMBOL,
  SOURCE_PROP,
} from "./constants";
import { getSourceFile, isProjectLocalSource } from "./sourceMetadata";

export type TriggerKey = "alt" | "meta" | "ctrl" | "shift" | "none";
export type LocatorMode = "direct" | "screen" | "implementation";

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
};

type StatusOverlay = {
  setStatus: (message: string, tone?: "idle" | "success" | "error") => void;
  setCopyValue: (value: string | null) => void;
  setMode: (mode: LocatorMode) => void;
  remove: () => void;
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

function getReactFiberKey(element: Element) {
  return Object.keys(element).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
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

function normalizeSource(source: string, projectRoot: string | undefined): string {
  if (!projectRoot || !source) return source;
  const match = source.match(/^(.*):(\d+):(\d+)$/);
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
  direct: string | null;
  screen: string | null;
  implementation: string | null;
};

function resolveSourceCandidates(fiber: ReactFiber | null, projectRoot?: string): ResolvedCandidates {
  let current = fiber;
  const jsxCandidates: SourceCandidate[] = [];
  const componentCandidates: SourceCandidate[] = [];

  while (current) {
    const rawJsxSource =
      getSourceFromProps(current.pendingProps) ?? getSourceFromProps(current.memoizedProps) ?? getDirectDebugSource(current);
    const jsxSource = normalizeSource(rawJsxSource ?? "", projectRoot) || rawJsxSource;
    if (jsxSource) {
      const file = getSourceFile(jsxSource);
      if (file && !jsxCandidates.some((candidate) => candidate.source === jsxSource)) {
        jsxCandidates.push({ source: jsxSource, file });
      }
    }

    const rawComponentSource = getSourceFromType(current.type) ?? getSourceFromType(current.elementType);
    const componentSource = normalizeSource(rawComponentSource ?? "", projectRoot) || rawComponentSource;
    if (componentSource) {
      const file = getSourceFile(componentSource);
      if (file && !componentCandidates.some((candidate) => candidate.source === componentSource)) {
        componentCandidates.push({ source: componentSource, file });
      }
    }

    current = current.return ?? null;
  }

  const direct = jsxCandidates[0]?.source ?? null;
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
    direct: direct ?? screenFallback,
    screen: screenFallback,
    implementation: implementationComponentCandidate ?? implementationJsxCandidate ?? screenFallback,
  };
}

function getModeDescription(mode: LocatorMode) {
  if (mode === "direct") {
    return "Direct JSX";
  }

  if (mode === "screen") {
    return "Screen source";
  }

  return "Implementation source";
}

function createStatusOverlay(triggerKey: TriggerKey): StatusOverlay | null {
  if (typeof document === "undefined") {
    return null;
  }

  const element = document.createElement("div");
  let copyValue: string | null = null;
  let currentMode: LocatorMode = "screen";
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  element.setAttribute("data-react-code-locator", "true");
  Object.assign(element.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "2147483647",
    padding: "8px 10px",
    borderRadius: "8px",
    background: "rgba(17, 24, 39, 0.92)",
    color: "#fff",
    fontSize: "12px",
    lineHeight: "1.4",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.25)",
    pointerEvents: "auto",
    cursor: "pointer",
    maxWidth: "min(70vw, 720px)",
    wordBreak: "break-all",
    opacity: "0",
    transition: "opacity 120ms ease",
  });

  const show = (message: string, tone: "idle" | "success" | "error") => {
    element.textContent = message;
    element.style.background =
      tone === "success"
        ? "rgba(6, 95, 70, 0.92)"
        : tone === "error"
          ? "rgba(153, 27, 27, 0.94)"
          : "rgba(17, 24, 39, 0.92)";
    element.style.opacity = "1";
    element.style.pointerEvents = "auto";

    if (hideTimer) {
      clearTimeout(hideTimer);
    }

    hideTimer = setTimeout(() => {
      element.style.opacity = "0";
      element.style.pointerEvents = "none";
    }, 2000);
  };

  element.addEventListener("click", async () => {
    if (!copyValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      show(`[react-code-locator] copied`, "success");
    } catch {
      show(`[react-code-locator] copy failed`, "error");
    }
  });

  show(`[react-code-locator] enabled (${triggerKey}+click, alt+1/2/3 to switch mode)`, "idle");

  const mount = () => {
    if (!element.isConnected && document.body) {
      document.body.appendChild(element);
    }
  };

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }

  return {
    setStatus(message, tone = "idle") {
      show(message, tone);
    },
    setCopyValue(value) {
      copyValue = value;
    },
    setMode(mode) {
      currentMode = mode;
      show(`[react-code-locator] ${getModeDescription(mode)}`, "idle");
    },
    remove() {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      element.remove();
    },
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
  const source = candidates[mode] ?? candidates.screen ?? candidates.direct ?? candidates.implementation;
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

export function enableReactComponentJump(options: LocatorOptions = {}) {
  if (process.env.NODE_ENV !== "development") return;
  const overlay = createStatusOverlay(options.triggerKey ?? "shift");
  let currentMode: LocatorMode = "screen";
  const {
    triggerKey = "shift",
    projectRoot,
    onLocate = (result) => {
      console.log(`[react-code-locator] ${result.source}`);
      overlay?.setCopyValue(result.source);
      overlay?.setStatus(`[react-code-locator] ${result.source}`, "success");
    },
    onError = (error) => {
      console.error("[react-code-locator]", error);
      const message = error instanceof Error ? error.message : String(error);
      overlay?.setCopyValue(null);
      overlay?.setStatus(`[react-code-locator] ${message}`, "error");
    },
  } = options;

  console.log("[react-code-locator] enabled", { triggerKey });

  const keyHandler = (event: KeyboardEvent) => {
    if (!event.altKey) {
      return;
    }

    if (event.code === "Digit1") {
      currentMode = "direct";
      overlay?.setMode(currentMode);
      event.preventDefault();
      return;
    }

    if (event.code === "Digit2") {
      currentMode = "screen";
      overlay?.setMode(currentMode);
      event.preventDefault();
      return;
    }

    if (event.code === "Digit3") {
      currentMode = "implementation";
      overlay?.setMode(currentMode);
      event.preventDefault();
    }
  };

  const handler = (event: MouseEvent) => {
    if (!isTriggerPressed(event, triggerKey)) {
      return;
    }

    const result = locateComponentSource(event.target, currentMode, projectRoot);
    if (!result) {
      onError(new Error("No React component source metadata found for clicked element."));
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onLocate(result);
  };

  document.addEventListener("click", handler, true);
  document.addEventListener("keydown", keyHandler, true);

  return () => {
    document.removeEventListener("click", handler, true);
    document.removeEventListener("keydown", keyHandler, true);
    overlay?.remove();
  };
}
