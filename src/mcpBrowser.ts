import {
  getActiveLocatorMode,
  locateComponentSource,
  setActiveLocatorMode,
  type LocatorMode,
  type LocatorResult,
} from "./runtime";

export const LOCATOR_MCP_BRIDGE_GLOBAL = "__REACT_CODE_LOCATOR_MCP__";

export type LocatorMcpBridge = {
  ping: () => boolean;
  getMode: () => LocatorMode;
  setMode: (mode: LocatorMode) => LocatorMode;
  getSourceAtPoint: (input: {
    x: number;
    y: number;
    mode?: LocatorMode;
  }) => LocatorResult | null;
  getSourceForSelector: (input: {
    selector: string;
    mode?: LocatorMode;
  }) => LocatorResult | null;
  getSourceForActiveElement: (input?: {
    mode?: LocatorMode;
  }) => LocatorResult | null;
};

function resolveMode(mode?: LocatorMode) {
  return mode ?? getActiveLocatorMode();
}

export function createLocatorMcpBridge(): LocatorMcpBridge {
  return {
    ping() {
      return typeof document !== "undefined";
    },
    getMode() {
      return getActiveLocatorMode();
    },
    setMode(mode) {
      setActiveLocatorMode(mode);
      return mode;
    },
    getSourceAtPoint({ x, y, mode }) {
      const target = typeof document === "undefined" ? null : document.elementFromPoint(x, y);
      return locateComponentSource(target, resolveMode(mode));
    },
    getSourceForSelector({ selector, mode }) {
      const target = typeof document === "undefined" ? null : document.querySelector(selector);
      return locateComponentSource(target, resolveMode(mode));
    },
    getSourceForActiveElement({ mode } = {}) {
      const target = typeof document === "undefined" ? null : document.activeElement;
      return locateComponentSource(target, resolveMode(mode));
    },
  };
}

export function installLocatorMcpBridge() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const record = globalThis as Record<string, unknown>;
  const existing = record[LOCATOR_MCP_BRIDGE_GLOBAL];
  if (existing && typeof existing === "object") {
    return existing as LocatorMcpBridge;
  }

  const bridge = createLocatorMcpBridge();
  record[LOCATOR_MCP_BRIDGE_GLOBAL] = bridge;
  return bridge;
}

declare global {
  interface Window {
    __REACT_CODE_LOCATOR_MCP__?: LocatorMcpBridge;
  }
}
