/**
 * Hook D — a Babel visitor that rides inside the pass @vitejs/plugin-react already runs.
 * It adds zero parsing, because Babel built the AST anyway.
 *
 * It stamps two things:
 *
 *   1. Component *definition* sites. No compiler computes these; only an AST walk can.
 *   2. JSX *call* sites — even though hook G is supposed to get those for free.
 *
 * (2) needs justifying, because the whole premise of this package is not recomputing what
 * the compiler already computed. The problem is that in Vite, @vitejs/plugin-react hands
 * the JSX transform to esbuild (`esbuild: { jsx: "automatic" }`) and Babel runs first,
 * prepending a ~19 line fast-refresh preamble. esbuild then computes `__source` against
 * that shifted text, so every line number hook G receives is off by the preamble length.
 *
 * The compiler's answer is only trustworthy when nothing moves the code between the parse
 * and the JSX transform. Where we have an AST with original `loc` in hand, use it.
 *
 * Both hooks write to the same registry and hook D runs outermost — `__rcl(jsxDEV(...))` —
 * so the accurate value naturally overwrites the approximate one.
 */

import { COMPONENT_SOURCE_PROP, REGISTRY_SYMBOL } from "../registry";

// Minimal structural types — we deliberately do not depend on @babel/core's types so
// this file stays buildable without pulling Babel into the package's own dependencies.
interface BabelTypes {
  identifier(name: string): any;
  stringLiteral(value: string): any;
  memberExpression(object: any, property: any): any;
  assignmentExpression(op: string, left: any, right: any): any;
  callExpression(callee: any, args: any[]): any;
  numericLiteral(value: number): any;
  jsxExpressionContainer(expression: any): any;
  logicalExpression(op: string, left: any, right: any): any;
  binaryExpression(op: string, left: any, right: any): any;
  unaryExpression(op: string, argument: any): any;
  expressionStatement(expression: any): any;
}

export interface BabelPluginOptions {
  /** Paths are emitted relative to this. Defaults to process.cwd(). */
  projectRoot?: string;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * "direct"  -> the initializer is literally a function/class expression, so the value is
 *              guaranteed to be an object; the assignment needs no type guard.
 * "wrapped" -> a call (memo/forwardRef/observer/withX/...) or a styled`` template. Almost
 *              always a component, but it could return a primitive, so guard it.
 *
 * Allow-listing HOC names was the old approach and it missed every project-local HOC.
 * Any call is accepted here and the guard absorbs the risk.
 */
type InitKind = "direct" | "wrapped" | null;

function classifyInit(node: any): InitKind {
  if (!node) return null;
  const t = node.type;
  if (
    t === "ArrowFunctionExpression" ||
    t === "FunctionExpression" ||
    t === "ClassExpression"
  ) {
    return "direct";
  }
  if (t === "CallExpression" || t === "TaggedTemplateExpression") return "wrapped";
  return null;
}

/** A class is a component only if it extends something — keeps plain data classes out. */
function looksLikeComponentClass(node: any): boolean {
  return Boolean(node?.superClass);
}

function toRelative(filename: string, root: string): string {
  return filename.startsWith(root) ? filename.slice(root.length + 1) : filename;
}

/**
 * Builds `Object.isExtensible(X) && (X.__componentSourceLoc = "...")`.
 *
 * `Object.isExtensible` is the load-bearing part: frozen or sealed values (design-system
 * exports, Object.freeze'd components, svgr output, some HOC results) would otherwise
 * throw "object is not extensible". ESM is strict mode, so a failed assignment is fatal
 * and takes the whole app down. Locating a component is a convenience; it must never
 * break the host app.
 */
function buildAssignment(t: BabelTypes, name: string, value: string, guarded: boolean): any {
  const ref = () => t.identifier(name);

  const assign = t.assignmentExpression(
    "=",
    t.memberExpression(ref(), t.identifier(COMPONENT_SOURCE_PROP)),
    t.stringLiteral(value),
  );

  const extensible = t.callExpression(
    t.memberExpression(t.identifier("Object"), t.identifier("isExtensible")),
    [ref()],
  );

  let expression = t.logicalExpression("&&", extensible, assign);

  if (guarded) {
    // Short-circuits when the wrapper turned out to return a primitive or null.
    const isObjectOrFunction = t.logicalExpression(
      "||",
      t.binaryExpression("===", t.unaryExpression("typeof", ref()), t.stringLiteral("object")),
      t.binaryExpression("===", t.unaryExpression("typeof", ref()), t.stringLiteral("function")),
    );
    expression = t.logicalExpression(
      "&&",
      ref(),
      t.logicalExpression("&&", isObjectOrFunction, expression),
    );
  }

  return t.expressionStatement(expression);
}

/**
 * `export default function Foo(){}` / `export const Foo = ...` put the declaration inside
 * an export wrapper. Appending after the declaration itself would land the statement
 * inside the export, which is invalid — walk up to the wrapper first.
 */
function insertionTarget(path: any): any {
  const parent = path.parentPath;
  const type = parent?.node?.type;
  if (type === "ExportNamedDeclaration" || type === "ExportDefaultDeclaration") return parent;
  return path;
}

const HELPER = "__rcl_register";

/**
 * Injected once per file that contains JSX. Keeps the location in the same WeakMap hook G
 * writes to, so the browser runtime has exactly one place to look.
 *
 * Deliberately written without optional chaining or logical assignment: this text is
 * emitted as-is and has to parse under whatever target the host project compiles to.
 */
function helperSource(): string {
  return `
var ${HELPER}_map = globalThis[Symbol.for("${REGISTRY_SYMBOL.description}")];
if (!${HELPER}_map) { ${HELPER}_map = new WeakMap(); globalThis[Symbol.for("${REGISTRY_SYMBOL.description}")] = ${HELPER}_map; }
function ${HELPER}(element, file, line, column) {
  if (element && element.props) { ${HELPER}_map.set(element.props, { file: file, line: line, column: column }); }
  return element;
}
`;
}

export default function reactCodeLocatorBabelPlugin({
  types: t,
  template,
}: {
  types: BabelTypes;
  template: { statements: { ast(code: string): any[] } };
}) {
  // Nodes we have already wrapped. Babel re-traverses the replacement, so without this the
  // visitor would wrap its own output forever.
  const wrapped = new WeakSet<object>();

  return {
    name: "react-code-locator",

    visitor: {
      Program: {
        exit(path: any, state: any) {
          if (!state.get("rclNeedsHelper")) return;
          path.unshiftContainer("body", template.statements.ast(helperSource()));
        },
      },

      JSXElement(path: any, state: any) {
        const node = path.node;
        if (wrapped.has(node) || !node.loc) return;

        const filename: string = state.file?.opts?.filename ?? "";
        if (!filename) return;

        wrapped.add(node);
        state.set("rclNeedsHelper", true);

        const root: string = state.opts?.projectRoot ?? process.cwd();
        const call = t.callExpression(t.identifier(HELPER), [
          node,
          t.stringLiteral(toRelative(filename, root)),
          t.numericLiteral(node.loc.start.line),
          // Babel columns are 0-based; editors expect 1-based.
          t.numericLiteral(node.loc.start.column + 1),
        ]);

        // A JSX element sitting in `children` must stay inside an expression container, or
        // the call would be emitted as literal text in the DOM.
        const inChildren =
          path.parentPath?.node?.type === "JSXElement" ||
          path.parentPath?.node?.type === "JSXFragment";

        path.replaceWith(inChildren ? t.jsxExpressionContainer(call) : call);
      },

      FunctionDeclaration(path: any, state: any) {
        const name = path.node.id?.name;
        if (!name || !isComponentName(name) || !path.node.loc) return;
        stamp(t, insertionTarget(path), name, path.node.loc, state, false);
      },

      ClassDeclaration(path: any, state: any) {
        const name = path.node.id?.name;
        if (!name || !isComponentName(name)) return;
        if (!looksLikeComponentClass(path.node) || !path.node.loc) return;
        stamp(t, insertionTarget(path), name, path.node.loc, state, false);
      },

      VariableDeclarator(path: any, state: any) {
        const id = path.node.id;
        if (id?.type !== "Identifier" || !isComponentName(id.name)) return;

        const declaration = path.parentPath; // VariableDeclaration
        if (declaration?.node?.type !== "VariableDeclaration") return;

        const kind = classifyInit(path.node.init);
        if (!kind) return;

        const loc = path.node.loc || path.node.init?.loc;
        if (!loc) return;

        // Append after the whole declaration (or its export wrapper), not after the
        // declarator — `const A = () => {}, B = () => {}` would otherwise break.
        stamp(t, insertionTarget(declaration), id.name, loc, state, kind === "wrapped");
      },
    },
  };
}

function stamp(
  t: BabelTypes,
  target: any,
  name: string,
  loc: { start: { line: number; column: number } },
  state: any,
  guarded: boolean,
): void {
  // Only statement positions can take an appended expression statement. Anything else
  // (a declaration inside a `for` head, a class expression body) is skipped rather than
  // producing invalid code.
  if (!target.parentPath || !target.isStatement?.()) return;

  const filename: string = state.file?.opts?.filename ?? "";
  if (!filename) return;

  const root: string = state.opts?.projectRoot ?? process.cwd();
  // Babel columns are 0-based; editors expect 1-based.
  const value = `${toRelative(filename, root)}:${loc.start.line}:${loc.start.column + 1}`;

  target.insertAfter(buildAssignment(t, name, value, guarded));
}
