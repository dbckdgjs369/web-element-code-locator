# MCP Server API Design

## Goal

Expose `react-code-locator` as an MCP server so an AI agent can inspect a live browser, resolve the clicked or targeted UI element back to source code, and then open or edit the relevant file in the workspace.

This design assumes:

- `react-code-locator` runtime is already injected into the target page in dev mode
- the MCP server can talk to a browser automation layer such as Playwright or Chrome DevTools Protocol
- the MCP server runs in the same workspace as the source tree

## Design Principles

- Root workflow should be "inspect browser element -> resolve source -> act on file"
- Tools should return source paths in a machine-friendly format
- The server should not depend on text matching or DOM heuristics when locator metadata is available
- The browser bridge should be replaceable: Playwright first, CDP-compatible later
- The API should support both direct automation and human-in-the-loop selection

## High-Level Architecture

There are 3 layers.

1. MCP server
   Receives tool calls from the AI and returns structured results.

2. Browser bridge
   Talks to a running browser page through Playwright or CDP.

3. Locator runtime bridge
   A small browser-side API that wraps `enableReactComponentJump()` and `locateComponentSource()`.

The browser-side bridge should expose a stable global, for example:

```ts
window.__REACT_CODE_LOCATOR_MCP__ = {
  ping(): boolean,
  getSourceAtPoint(input): LocatorResult | null,
  getSourceForSelector(input): LocatorResult | null,
  getSourceForActiveElement(input): LocatorResult | null,
  setMode(mode): void,
  getMode(): LocatorMode,
  highlightSelector(selector): void,
}
```

This keeps the MCP server independent from React internals. The browser page does the source resolution using the existing runtime.

## Core Data Model

### LocatorMode

```ts
type LocatorMode = "direct" | "screen" | "implementation";
```

### SourceLocation

```ts
type SourceLocation = {
  source: string;      // e.g. "src/pages/login/Login.tsx:179:29"
  file: string;        // e.g. "src/pages/login/Login.tsx"
  line: number;        // 1-based
  column: number;      // 1-based
  mode: LocatorMode;
};
```

### BrowserTarget

```ts
type BrowserTarget = {
  pageId?: string;
  url?: string;
};
```

### ToolError

```ts
type ToolError = {
  code:
    | "BROWSER_NOT_CONNECTED"
    | "PAGE_NOT_FOUND"
    | "LOCATOR_RUNTIME_MISSING"
    | "ELEMENT_NOT_FOUND"
    | "SOURCE_NOT_FOUND"
    | "FILE_NOT_IN_WORKSPACE"
    | "INVALID_ARGUMENT";
  message: string;
};
```

## MCP Tools

### 1. `locator.ping`

Checks whether the browser bridge and locator runtime are available.

Input:

```json
{
  "pageId": "optional"
}
```

Output:

```json
{
  "browserConnected": true,
  "pageFound": true,
  "runtimeAvailable": true,
  "mode": "screen",
  "url": "http://127.0.0.1:3200/"
}
```

Use:

- first health check
- detect missing runtime injection

### 2. `locator.set_mode`

Sets the active locator mode in the target page.

Input:

```json
{
  "mode": "screen",
  "pageId": "optional"
}
```

Output:

```json
{
  "mode": "screen"
}
```

Use:

- mirror the current manual `alt+1/2/3` flow
- let AI explicitly choose intent before resolving source

### 3. `locator.get_mode`

Returns the current mode.

Input:

```json
{
  "pageId": "optional"
}
```

Output:

```json
{
  "mode": "screen"
}
```

### 4. `locator.get_source_at_point`

Resolves source for the element rendered at viewport coordinates.

Input:

```json
{
  "x": 512,
  "y": 341,
  "mode": "optional",
  "pageId": "optional"
}
```

Output:

```json
{
  "location": {
    "source": "src/pages/login/Login.tsx:179:29",
    "file": "src/pages/login/Login.tsx",
    "line": 179,
    "column": 29,
    "mode": "screen"
  }
}
```

Use:

- AI sees a screenshot, picks a coordinate, resolves source
- best low-level primitive for automation

### 5. `locator.get_source_for_selector`

Resolves source for the first element matching a selector.

Input:

```json
{
  "selector": "[data-testid='login-button']",
  "mode": "optional",
  "pageId": "optional"
}
```

Output:

```json
{
  "location": {
    "source": "src/pages/login/Login.tsx:179:29",
    "file": "src/pages/login/Login.tsx",
    "line": 179,
    "column": 29,
    "mode": "screen"
  }
}
```

Use:

- stable when a selector already exists
- better than coordinate targeting for tests and automation

### 6. `locator.get_source_for_active_element`

Resolves source for the current active element.

Input:

```json
{
  "mode": "optional",
  "pageId": "optional"
}
```

Output:

```json
{
  "location": {
    "source": "src/pages/login/Login.tsx:191:29",
    "file": "src/pages/login/Login.tsx",
    "line": 191,
    "column": 29,
    "mode": "screen"
  }
}
```

Use:

- keyboard navigation
- accessibility-focused workflows

### 7. `locator.inspect`

Composite tool for agent workflows. Finds an element, resolves source, and returns nearby context.

Input:

Exactly one targeting strategy should be provided.

```json
{
  "selector": ".rc-logo",
  "mode": "screen",
  "includeDomSummary": true,
  "includeSourcePreview": true,
  "pageId": "optional"
}
```

Output:

```json
{
  "location": {
    "source": "src/components/Logo/Logo.tsx:64:1",
    "file": "src/components/Logo/Logo.tsx",
    "line": 64,
    "column": 1,
    "mode": "screen"
  },
  "domSummary": {
    "tagName": "A",
    "text": "",
    "selector": ".rc-logo > a"
  },
  "sourcePreview": {
    "startLine": 60,
    "endLine": 68
  }
}
```

Use:

- default tool an agent would call after selecting an element
- can be backed by other tools internally

### 8. `locator.open_in_editor`

Opens the resolved source location in the local editor.

Input:

```json
{
  "source": "src/pages/login/Login.tsx:179:29"
}
```

Output:

```json
{
  "opened": true
}
```

Use:

- quick jump from source resolution to implementation

### 9. `locator.list_pages`

Lists known pages or browser tabs the MCP server can target.

Input:

```json
{}
```

Output:

```json
{
  "pages": [
    {
      "pageId": "page-1",
      "url": "http://127.0.0.1:3200/",
      "title": "User Admin"
    }
  ]
}
```

Use:

- multi-page browser sessions
- lets AI choose the right target before inspection

## Recommended Minimal v1

The smallest useful v1 is:

- `locator.ping`
- `locator.list_pages`
- `locator.set_mode`
- `locator.get_source_at_point`
- `locator.get_source_for_selector`
- `locator.open_in_editor`

This is enough for:

1. connect to a dev browser
2. choose page
3. resolve source from a click target or selector
4. jump to code

## Browser Bridge Contract

The browser-side runtime should expose stable functions that the MCP server can `page.evaluate(...)`.

Recommended signatures:

```ts
type GetSourceAtPointInput = {
  x: number;
  y: number;
  mode?: LocatorMode;
};

type GetSourceForSelectorInput = {
  selector: string;
  mode?: LocatorMode;
};

type GetSourceForActiveElementInput = {
  mode?: LocatorMode;
};
```

Behavior:

- `getSourceAtPoint` uses `document.elementFromPoint(x, y)`
- `getSourceForSelector` uses `document.querySelector(selector)`
- `getSourceForActiveElement` uses `document.activeElement`
- all of them delegate to `locateComponentSource(target, mode)`

## Error Handling

Expected failures should be explicit, not stringly-typed.

Examples:

- page exists but runtime not injected
  return `LOCATOR_RUNTIME_MISSING`
- selector not found
  return `ELEMENT_NOT_FOUND`
- target found but no source resolved
  return `SOURCE_NOT_FOUND`
- source resolves outside workspace
  return `FILE_NOT_IN_WORKSPACE`

This matters for AI workflows because the agent needs to decide whether to:

- retry with another mode
- choose another selector
- fall back to grep or static analysis

## Mode Strategy for AI

Recommended default mode for agents:

- `screen`

Reason:

- closest to "take me to the screen code I should edit"
- usually better than raw implementation
- less likely to land in design-system internals

Recommended fallback order:

1. `screen`
2. `direct`
3. `implementation`

This order should be handled by the agent, not hidden in the server.

## Suggested Agent Workflow

1. `locator.list_pages`
2. `locator.ping`
3. `locator.set_mode("screen")`
4. `locator.get_source_for_selector(...)` or `locator.get_source_at_point(...)`
5. read the returned file in the workspace
6. if result is too abstract, retry with `direct`
7. if result is too high-level, retry with `implementation`

## Future Extensions

Possible v2 additions:

- `locator.get_source_candidates`
  return `direct`, `screen`, `implementation` in one response
- `locator.highlight_selector`
  briefly mark a DOM target before resolving source
- `locator.get_component_stack`
  return a summarized React owner/fiber path
- `locator.capture_element_screenshot`
  crop screenshot around the chosen element
- `locator.apply_mode_temporarily`
  run a resolution in a mode without mutating the page's current mode

## Non-Goals

These should stay outside the first MCP design:

- React production support
- framework-specific SSR or RSC handling
- generic DOM-to-source mapping without runtime injection
- deep IDE integration inside the MCP server itself

## Open Questions

These should be resolved before implementation:

1. Should the MCP server own the browser session, or attach to an existing one?
2. Should `open_in_editor` be part of this package or delegated to another local tool?
3. Should the browser bridge be injected automatically, or only when the dev app includes `react-code-locator`?
4. Should `locator.get_source_candidates` exist in v1 so the AI can choose among all modes itself?

## Recommendation

Implement v1 with a Playwright-backed MCP server and a small browser global bridge.

That gives the best balance of:

- low implementation complexity
- high reliability
- immediate usefulness for AI-assisted debugging and editing
