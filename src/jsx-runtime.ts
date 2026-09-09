/**
 * Production JSX runtime — a pure re-export.
 *
 * `jsx`/`jsxs` never receive a source argument, so there is nothing to capture and
 * nothing to wrap. Keeping this file as a straight pass-through means a project can
 * point `jsxImportSource` at us permanently without paying anything in a prod build;
 * bundlers inline the re-export and this module disappears.
 */

export { jsx, jsxs, Fragment } from "react/jsx-runtime";
