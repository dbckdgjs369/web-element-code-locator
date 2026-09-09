"use client";

// Next has no equivalent of Vite's transformIndexHtml, so the client runtime is mounted
// by the app itself. This is exactly the snippet the README tells users to write.

import { useEffect } from "react";
import {
  detectDevServer,
  enableLocator,
  locate,
  locateAsync,
} from "react-code-locator/runtime";

declare global {
  interface Window {
    __rclLocate?: (el: Element, mode: "screen" | "implementation") => unknown;
    __rclLocateAsync?: (el: Element, mode: "screen" | "implementation") => Promise<unknown>;
    __rclDetect?: () => string;
  }
}

export function Locator() {
  useEffect(() => {
    // Lets e2e.mjs ask for a location without synthesising pointer input. Both are
    // exposed because the two answer differently for server components — the sync one
    // cannot, by construction.
    window.__rclLocate = (el, mode) => locate(el, mode);
    window.__rclLocateAsync = (el, mode) => locateAsync(el, mode);
    window.__rclDetect = () => detectDevServer();
    return enableLocator({ triggerKey: "shift", openInEditor: true });
  }, []);
  return null;
}
