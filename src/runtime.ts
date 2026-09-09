/**
 * Browser runtime — the only consumer of the registry.
 *
 * Hold the trigger key to highlight what's under the cursor; right-click to get a menu
 * with "open in editor" and "copy path". Alt+1 / Alt+2 switch between locating where an
 * element is *used* and where its component is *implemented*.
 *
 * Every element this file creates is tracked in `ownElements` so the locator never tries
 * to locate its own overlay.
 */

import { locate, locateAsync, type LocatorMode, type LocatorResult } from "./locate";
import { detectDevServer, editorRequestFor } from "./dev-server";

// Re-exported so the browser condition of the package root can point at this file and
// still serve everything client code needs.
export { locate, locateAsync } from "./locate";
export { detectDevServer } from "./dev-server";
export type { LocatorMode, LocatorResult } from "./locate";
export { getRegistry, REGISTRY_SYMBOL, COMPONENT_SOURCE_PROP } from "./registry";
export type { SourceLocation } from "./registry";

export type TriggerKey = "alt" | "meta" | "ctrl" | "shift" | "none";

export interface LocatorOptions {
  /** Key held to arm the locator. Defaults to "shift". */
  triggerKey?: TriggerKey;
  /** Paths are reported relative to this. */
  projectRoot?: string;
  enabled?: boolean;
  /**
   * Adds "Open in editor" to the context menu. The endpoint is picked from the detected
   * dev server — `/__open-in-editor` under Vite, `/__nextjs_launch-editor` under Next.
   */
  openInEditor?: boolean;
  onLocate?: (result: LocatorResult) => void;
  onError?: (error: unknown) => void;
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const ownElements = new WeakSet<Element>();

/**
 * Marks an element as ours so the locator never tries to locate its own overlay, and
 * tags it in the DOM. The attribute is the only handle a user has for overriding these
 * styles or for skipping the overlay in their own querySelector calls, so it is part of
 * the public surface even though nothing here reads it.
 */
function own<T extends Element>(element: T, name?: string): T {
  ownElements.add(element);
  if (name) element.setAttribute(`data-react-code-locator-${name}`, "true");
  return element;
}

function triggerKeyName(key: TriggerKey): string | null {
  if (key === "alt") return "Alt";
  if (key === "meta") return "Meta";
  if (key === "ctrl") return "Control";
  if (key === "shift") return "Shift";
  return null;
}

function isTriggerHeld(event: MouseEvent, key: TriggerKey): boolean {
  if (key === "none") return true;
  if (key === "alt") return event.altKey;
  if (key === "meta") return event.metaKey;
  if (key === "ctrl") return event.ctrlKey;
  return event.shiftKey;
}

function toElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function showToast(message: string, tone: "idle" | "success" = "idle"): void {
  document.querySelector("[data-react-code-locator-toast]")?.remove();

  const toast = own(document.createElement("div"), "toast");
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
    fontFamily: MONO,
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.25)",
    pointerEvents: "none",
    transition: "opacity 200ms ease",
  });
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 1800);
}

function createHighlight() {
  const box = own(document.createElement("div"), "highlight");
  Object.assign(box.style, {
    position: "fixed",
    zIndex: "2147483645",
    pointerEvents: "none",
    background: "rgba(59, 130, 246, 0.12)",
    outline: "2px solid rgba(59, 130, 246, 0.75)",
    outlineOffset: "-1px",
    boxSizing: "border-box",
    display: "none",
  });

  const label = own(document.createElement("div"), "label");
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
    fontFamily: MONO,
    maxWidth: "min(60vw, 480px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "none",
  });

  const mount = () => {
    document.body.append(box, label);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  return {
    update(element: Element, source: string) {
      const rect = element.getBoundingClientRect();
      Object.assign(box.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        display: "block",
      });

      label.textContent = source.replace(/^.*[/\\]/, "").replace(/:(\d+):\d+$/, ":$1");
      label.style.display = "block";
      // Prefer above the element; flip below when there is no room at the top.
      const above = rect.top - 22;
      label.style.top = above >= 4 ? `${above}px` : `${rect.bottom + 4}px`;
      label.style.left = `${Math.max(4, rect.left)}px`;
    },
    hide() {
      box.style.display = "none";
      label.style.display = "none";
    },
    remove() {
      box.remove();
      label.remove();
    },
  };
}

function createMenu() {
  let current: HTMLElement | null = null;

  const dismiss = () => {
    current?.remove();
    current = null;
    document.removeEventListener("click", dismiss, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") dismiss();
  };

  const item = (text: string, onClick: () => void) => {
    const el = own(document.createElement("div"), "menu-item");
    el.textContent = text;
    Object.assign(el.style, { padding: "7px 14px", cursor: "pointer", whiteSpace: "nowrap" });
    el.addEventListener("mouseenter", () => (el.style.background = "rgba(255,255,255,0.1)"));
    el.addEventListener("mouseleave", () => (el.style.background = ""));
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
      dismiss();
    });
    return el;
  };

  return {
    dismiss,
    /** `source` is what "Copy path" yields; `label` is what the header shows. */
    show(
      x: number,
      y: number,
      source: string,
      onOpen: (() => void) | null,
      label: string = source,
    ) {
      dismiss();

      const menu = own(document.createElement("div"), "menu");
      Object.assign(menu.style, {
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        zIndex: "2147483647",
        background: "rgba(17, 24, 39, 0.96)",
        borderRadius: "6px",
        padding: "4px 0",
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
        fontFamily: MONO,
        fontSize: "12px",
        color: "#fff",
        minWidth: "160px",
      });

      const header = own(document.createElement("div"), "menu-header");
      header.textContent = label;
      Object.assign(header.style, {
        padding: "5px 14px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        marginBottom: "3px",
        color: "rgba(255,255,255,0.62)",
        fontSize: "11px",
        maxWidth: "min(70vw, 460px)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      menu.appendChild(header);

      if (onOpen) menu.appendChild(item("Open in editor", onOpen));
      menu.appendChild(
        item("Copy path", () => {
          navigator.clipboard.writeText(source).then(
            () => showToast("[react-code-locator] Copied", "success"),
            () => showToast("[react-code-locator] Copy failed"),
          );
        }),
      );

      document.body.appendChild(menu);
      current = menu;

      // Flip the menu back inside the viewport once it has a measurable size.
      requestAnimationFrame(() => {
        if (!current) return;
        const rect = current.getBoundingClientRect();
        if (rect.right > window.innerWidth) current.style.left = `${x - rect.width}px`;
        if (rect.bottom > window.innerHeight) current.style.top = `${y - rect.height}px`;
      });

      // Deferred, or the same click that opened the menu would close it.
      setTimeout(() => {
        document.addEventListener("click", dismiss, true);
        document.addEventListener("keydown", onKeyDown, true);
      }, 0);
    },
  };
}

export function enableLocator(options: LocatorOptions = {}): () => void {
  const {
    triggerKey = "shift",
    projectRoot,
    enabled = true,
    openInEditor = false,
    onLocate,
    onError,
  } = options;

  if (!enabled || typeof document === "undefined") return () => {};

  const highlight = createHighlight();
  const menu = createMenu();
  const keyName = triggerKeyName(triggerKey);

  let mode: LocatorMode = "screen";
  let armed = triggerKey === "none";
  let rafId: number | null = null;
  let cached: { target: Element; mode: LocatorMode; result: LocatorResult } | null = null;

  const report = onLocate ?? ((result: LocatorResult) => console.log(`[react-code-locator] ${result.source}`));
  const fail = onError ?? ((error: unknown) => console.error("[react-code-locator]", error));

  const resultFor = async (target: EventTarget | null): Promise<LocatorResult | null> => {
    const element = toElement(target);
    if (cached && cached.target === element && cached.mode === mode) return cached.result;
    return locateAsync(target, mode, projectRoot);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey && (event.code === "Digit1" || event.code === "Digit2")) {
      mode = event.code === "Digit1" ? "screen" : "implementation";
      showToast(
        mode === "screen"
          ? "[react-code-locator] Screen source (Alt+1)"
          : "[react-code-locator] Implementation source (Alt+2)",
      );
      event.preventDefault();
      return;
    }
    if (keyName && event.key === keyName) armed = true;
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!keyName || event.key !== keyName) return;
    armed = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    highlight.hide();
  };

  // Throttled to one hit-test per frame; mousemove fires far faster than we can redraw.
  const onMouseMove = (event: MouseEvent) => {
    if (!armed || rafId !== null) return;
    const target = event.target;

    rafId = requestAnimationFrame(() => {
      rafId = null;
      const element = toElement(target);
      if (!element || ownElements.has(element)) {
        highlight.hide();
        return;
      }

      const paint = (result: LocatorResult) => {
        cached = { target: element, mode, result };
        highlight.update(element, result.source);
      };

      const result = locate(target, mode, projectRoot);
      if (result) {
        paint(result);
        return;
      }

      // A server component's position takes a round trip the first time. Keep the last
      // highlight up rather than flickering, and paint when the answer lands — unless
      // the cursor has moved on, in which case a stale box would be worse than none.
      const requestedMode = mode;
      void locateAsync(target, requestedMode, projectRoot).then((late) => {
        if (!late || mode !== requestedMode) return;
        if (!element.isConnected) return;
        paint(late);
      });
    });
  };

  const onClick = (event: MouseEvent) => {
    if (!isTriggerHeld(event, triggerKey)) return;
    const element = toElement(event.target);
    if (element && ownElements.has(element)) return;

    // Committed as soon as the trigger matches: awaiting first would let the click reach
    // the page, which is exactly what someone holding the trigger key does not want.
    event.preventDefault();
    event.stopPropagation();

    void resultFor(event.target).then((result) => {
      if (!result) {
        fail(new Error("No source metadata found for the clicked element."));
        return;
      }
      report(result);
    });
  };

  const onContextMenu = (event: MouseEvent) => {
    if (!armed) return;
    const element = toElement(event.target);
    if (element && ownElements.has(element)) return;

    event.preventDefault();
    event.stopPropagation();

    void resultFor(event.target).then((result) => {
      if (!result) return;
      highlight.hide();

      const request = openInEditor ? editorRequestFor(result.source) : null;
      const onOpen = request
        ? () => {
            void fetch(request.url).then(
              (response) => {
                // v1's worst bug was a swallowed 404 that looked like a no-op. Say so.
                if (!response.ok) {
                  fail(
                    new Error(
                      `Editor endpoint answered ${response.status} (${detectDevServer()} dev server at ${request.url}).`,
                    ),
                  );
                }
              },
              (error) => fail(error),
            );
          }
        : null;

      const label = result.fallback
        ? `${result.source}  (no distinct ${mode} location)`
        : result.source;
      menu.show(event.clientX, event.clientY, result.source, onOpen, label);

      if (openInEditor && !request) {
        showToast("[react-code-locator] Unknown dev server — cannot open editor");
      }
    });
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("contextmenu", onContextMenu, true);

  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    menu.dismiss();
    highlight.remove();
  };
}
