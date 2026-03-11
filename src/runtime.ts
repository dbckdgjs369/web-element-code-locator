import { SOURCE_PROP } from "./constants";

export type TriggerKey = "alt" | "meta" | "ctrl" | "shift" | "none";

type ReactFiber = {
  return?: ReactFiber | null;
  type?: unknown;
  elementType?: unknown;
  pendingProps?: Record<string, unknown> | null;
  memoizedProps?: Record<string, unknown> | null;
  _debugSource?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  } | null;
};

export type LocatorResult = {
  source: string;
  mode: "jsx" | "component";
};

export type LocatorOptions = {
  triggerKey?: TriggerKey;
  onLocate?: (result: LocatorResult) => void;
  onError?: (error: unknown) => void;
};

type StatusOverlay = {
  setStatus: (message: string, tone?: "idle" | "success" | "error") => void;
  setCopyValue: (value: string | null) => void;
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
  const source = props?.[SOURCE_PROP];
  return typeof source === "string" ? source : null;
}

function resolveJsxSourceFromFiber(fiber: ReactFiber | null) {
  let current = fiber;

  while (current) {
    const source = getSourceFromProps(current.pendingProps) ?? getSourceFromProps(current.memoizedProps);
    if (source) {
      return source;
    }

    current = current.return ?? null;
  }

  return null;
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

function getDebugSource(fiber: ReactFiber | null) {
  let current = fiber;

  while (current) {
    const debugSource = current._debugSource;
    if (debugSource?.fileName && typeof debugSource.lineNumber === "number") {
      return `${debugSource.fileName.replace(/\\/g, "/")}:${debugSource.lineNumber}:${debugSource.columnNumber ?? 1}`;
    }

    current = current.return ?? null;
  }

  return null;
}

function createStatusOverlay(triggerKey: TriggerKey): StatusOverlay | null {
  if (typeof document === "undefined") {
    return null;
  }

  const element = document.createElement("div");
  let currentText = "";
  let copyValue: string | null = null;
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
    currentText = message;
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
    }, 1500);
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

  show(`[react-code-locator] enabled (${triggerKey}+click)`, "idle");

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
    remove() {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      element.remove();
    },
  };
}

export function locateComponentSource(target: EventTarget | null): LocatorResult | null {
  const elementTarget =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const fiber = getClosestReactFiber(elementTarget);
  if (!fiber) {
    return null;
  }

  const jsxSource = resolveJsxSourceFromFiber(fiber) ?? getDebugSource(fiber);
  if (jsxSource) {
    return {
      source: jsxSource,
      mode: "jsx",
    };
  }

  const componentSource = resolveComponentSourceFromFiber(fiber);
  if (!componentSource) {
    return null;
  }

  return {
    source: componentSource,
    mode: "component",
  };
}

export function enableReactComponentJump(options: LocatorOptions = {}) {
  const overlay = createStatusOverlay(options.triggerKey ?? "shift");
  const {
    triggerKey = "shift",
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

  const handler = (event: MouseEvent) => {
    console.log("[react-code-locator] click", {
      triggerKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      target: event.target,
    });

    if (!isTriggerPressed(event, triggerKey)) {
      return;
    }

    const result = locateComponentSource(event.target);
    if (!result) {
      onError(new Error("No React component source metadata found for clicked element."));
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onLocate(result);
  };

  document.addEventListener("click", handler, true);

  return () => {
    document.removeEventListener("click", handler, true);
    overlay?.remove();
  };
}
