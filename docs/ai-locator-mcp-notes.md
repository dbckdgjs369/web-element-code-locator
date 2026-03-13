# AI Locator and MCP Notes

## What this library does

`react-code-locator` maps a rendered React UI element back to a useful source location in the codebase.

The main value is not DOM selection itself. The main value is:

- taking an already identified UI element
- resolving it to a meaningful React code location
- avoiding dead ends like design-system internals when the screen-level callsite is more useful

## Why this is useful for AI

An AI agent can often find a DOM element by:

- text
- selector
- role
- accessibility tree
- screen coordinates

But that still does not answer:

- which file should be edited
- whether the best target is the screen callsite or the shared implementation
- how to avoid getting stuck in wrappers, styled-components, memo, forwardRef, or design-system layers

That is where `react-code-locator` adds value.

It works more like a code-mapping engine than an element-finding engine.

## Current source resolution model

The runtime supports 3 modes.

- `direct`
  closest JSX source that produced the clicked result
- `screen`
  nearest useful project-local screen source
- `implementation`
  external/shared implementation source

This matters because the same rendered UI can correspond to multiple valid source locations.

## How it works today

There are two parts.

1. Build-time/source transform
   Source metadata is attached while React code is being transformed.

2. Runtime/fiber lookup
   When a user clicks a rendered element, the runtime finds the nearest React Fiber and resolves source from metadata attached to the element and component chain.

## Who provides file/line/column today

Today, file/line/column comes from the transform stage.

More specifically:

- the current filename comes from the transformer context
- line/column comes from the AST node location

In the current implementation, that metadata is read during source transform and stored as `file:line:column`.

React itself does not generally provide this exact original source location in a stable, tool-independent way.

## Important limitation

Even if every React project eventually creates React elements, the shared React runtime layer usually does not know the original file/line/column by itself.

For example, by the time code becomes:

```js
jsx("div", { children: "Hello" })
```

the runtime can see:

- the element type
- the props

but it usually cannot know:

- which source file that call came from
- which original JSX line produced it

That means a transform step is still needed to provide source location data.

## Why the "React-common" idea is still valid

The common part across Babel, SWC, esbuild, Vite, and Webpack is this:

- JSX eventually becomes a React element factory call
- usually `jsx`, `jsxs`, `jsxDEV`, or `React.createElement`

So the long-term architecture should be:

- a common runtime core that stores and resolves source metadata for React elements
- thin adapters for each toolchain that only provide source location data

This is better than putting all logic into Babel-specific code.

## The most universal interception point

If the goal is "support as many React projects as possible", the most promising common interception point is not Babel itself.

It is the React element factory layer:

- `jsx`
- `jsxs`
- `jsxDEV`
- `React.createElement`

No matter which tool performs JSX transform, React code typically converges on one of these calls before elements are rendered.

That means a more universal strategy is:

- do not put the full implementation into each transform tool
- intercept or wrap React element creation in a shared runtime layer
- let each toolchain adapter only provide source location data

Conceptually, that can look like this:

```ts
import { jsx as _jsx } from "react/jsx-runtime";
import { wrapJsx } from "react-code-locator/runtime";

const jsx = wrapJsx(_jsx, import.meta.url);
```

Or in development mode:

```ts
import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";

const jsxDEV = wrapJsxDev(_jsxDEV, sourceInfo);
```

The important point is that the runtime core would handle:

- element wrapping
- metadata storage
- source lookup at runtime

while the transform-specific adapter would only be responsible for:

- finding the source location from the current file and AST node
- passing that location into the runtime core

## Why factory wrapping alone is not enough

Even though the React element factory layer is the best common point, it usually does not know the original source location by itself.

If code has already become:

```js
jsx("div", { children: "Hello" })
```

the runtime can usually see:

- element type
- props

but not:

- original source file
- original line
- original column

That information usually exists earlier, when the transform tool still has access to AST node locations.

So a pure runtime-only solution is usually not enough if precise `file:line:column` mapping is required.

## Practical architecture direction

The most realistic architecture is two-layered:

1. Common runtime core
   Handles React element wrapping, metadata storage, and runtime lookup.

2. Thin transform adapters
   Babel, SWC, esbuild, Vite, or Webpack-specific integration that only extracts and forwards source location data.

This gives the best tradeoff:

- common logic lives in one place
- tool-specific code becomes smaller
- the system stays aligned with the one thing all React projects share: React element creation

## Why MCP is interesting

MCP does not replace the locator runtime.
MCP makes that runtime usable by an AI agent as a tool.

The rough flow is:

1. user asks AI to change a UI element
2. AI identifies the target element in the browser
3. MCP calls the locator runtime in the page
4. locator resolves source
5. AI opens the file and edits it

So MCP is the interface layer that lets AI call the locator in a structured way.

## What MCP should do

MCP should expose tools such as:

- list browser pages
- ping locator runtime availability
- set/get mode
- resolve source by selector
- resolve source by screen coordinates
- resolve source for active element
- open the resolved source in the editor

The MCP server should not guess React internals by itself.
It should call a browser-side bridge that delegates to the existing locator runtime.

## What MCP does not solve

MCP does not solve target identification by itself.

An AI still needs some way to know what "this button" means, for example:

- a selector
- a coordinate
- a previously selected element
- another browser automation tool

So the locator MCP is most useful after element identification, not before it.

## Practical conclusion

This project is worth extending with MCP support.

The value is:

- AI can move from a rendered UI element to the right code faster
- fewer wrong turns into wrappers or shared internals
- better editing workflows in large React codebases

But the technical foundation should stay:

- common runtime/fiber-based resolution
- thin transform adapters for source location injection
- MCP as a separate AI-facing interface layer
