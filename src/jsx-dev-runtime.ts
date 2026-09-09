/**
 * Hook G — intercept the JSX dev runtime.
 *
 * In development the JSX compiler already emits the call site as the 5th argument:
 *
 *   jsxDEV(Button, props, key, isStatic, {fileName, lineNumber, columnNumber}, this)
 *
 * React 19 dropped `fiber._debugSource` and its jsxDEV ignores that argument entirely, so
 * the location is computed and then thrown away. We sit in front of React and keep it.
 *
 * Accuracy caveat: this is only as good as the compiler's transform ordering. Under
 * @vitejs/plugin-react the numbers are shifted by the fast-refresh preamble, which is why
 * the Babel hook overrides them there. Next's SWC emits correct numbers in both webpack
 * and Turbopack mode — measured, see playground/next/check.mjs.
 *
 * This module must never import anything that could be aliased back to itself; the Vite
 * integration relies on an importer check to let this one import through.
 */

import { jsxDEV as reactJsxDEV, Fragment } from "react/jsx-dev-runtime";
import { wrapJsxDev, type JsxDevSource } from "./wrap";

export type { JsxDevSource };

export const jsxDEV = wrapJsxDev(reactJsxDEV as Parameters<typeof wrapJsxDev>[0]);

export { Fragment };
