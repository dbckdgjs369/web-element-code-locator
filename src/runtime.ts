import { SOURCE_PROP } from "./constants";

export type TriggerKey = "alt" | "meta" | "ctrl" | "shift" | "none";

type ReactFiber = {
  return?: ReactFiber | null;
  type?: unknown;
  elementType?: unknown;
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

function resolveSourceFromFiber(fiber: ReactFiber | null) {
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

export function locateComponentSource(target: EventTarget | null): LocatorResult | null {
  const elementTarget =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const fiber = getClosestReactFiber(elementTarget);
  if (!fiber) {
    return null;
  }

  const debugSource = getDebugSource(fiber);
  if (debugSource) {
    return {
      source: debugSource,
      mode: "jsx",
    };
  }

  const componentSource = resolveSourceFromFiber(fiber);
  if (!componentSource) {
    return null;
  }

  return {
    source: componentSource,
    mode: "component",
  };
}

export function enableReactComponentJump(options: LocatorOptions = {}) {
  const {
    triggerKey = "shift",
    onLocate = (result) => {
      console.log(`[react-component-jump] ${result.source} [${result.mode}]`);
    },
    onError = (error) => {
      console.error("[react-component-jump]", error);
    },
  } = options;

  const handler = (event: MouseEvent) => {
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
  };
}

