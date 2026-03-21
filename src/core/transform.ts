/**
 * Source transform using acorn + acorn-typescript + acorn-jsx
 * Pure JS, fully bundlable, no native bindings required
 */

import * as acorn from "acorn";
import acornJsx from "acorn-jsx";
import acornTs from "acorn-typescript";
import { generate, GENERATOR } from "astring";
import { walk } from "estree-walker";
import type {
  Node,
  Program,
  FunctionDeclaration,
  VariableDeclarator,
  CallExpression,
  MemberExpression,
  Identifier,
  ExpressionStatement,
  AssignmentExpression,
} from "estree";
import { SOURCE_PROP, JSX_SOURCE_REGISTRY_SYMBOL } from "../constants";

// .tsx/.jsx: TypeScript plugin must come before JSX plugin
const ParserTSX = acorn.Parser.extend(acornTs() as any, acornJsx());
// .ts/.js: no JSX plugin (avoids <T,> generic arrow function ambiguity)
const ParserTS = acorn.Parser.extend(acornTs() as any);

function getParser(filename: string) {
  return /\.[jt]sx$/.test(filename) ? ParserTSX : ParserTS;
}

export interface TransformOptions {
  filename: string;
  projectRoot?: string;
  injectJsxSource?: boolean;
  injectComponentSource?: boolean;
}

interface Location {
  line: number;
  column: number;
}

// astring does not support JSX/TS nodes — extend with minimal printers
const jsxGenerator: typeof GENERATOR & Record<string, (node: any, state: any) => void> = {
  ...GENERATOR,
  JSXElement(node: any, state: any) {
    this[node.openingElement.type](node.openingElement, state);
    for (const child of node.children) this[child.type](child, state);
    if (node.closingElement) this[node.closingElement.type](node.closingElement, state);
  },
  JSXFragment(node: any, state: any) {
    state.write("<>");
    for (const child of node.children) this[child.type](child, state);
    state.write("</>");
  },
  JSXOpeningElement(node: any, state: any) {
    state.write("<");
    this[node.name.type](node.name, state);
    for (const attr of node.attributes) { state.write(" "); this[attr.type](attr, state); }
    state.write(node.selfClosing ? " />" : ">");
  },
  JSXClosingElement(node: any, state: any) {
    state.write("</"); this[node.name.type](node.name, state); state.write(">");
  },
  JSXIdentifier(node: any, state: any) { state.write(node.name); },
  JSXMemberExpression(node: any, state: any) {
    this[node.object.type](node.object, state);
    state.write(".");
    this[node.property.type](node.property, state);
  },
  JSXNamespacedName(node: any, state: any) {
    this[node.namespace.type](node.namespace, state);
    state.write(":");
    this[node.name.type](node.name, state);
  },
  JSXAttribute(node: any, state: any) {
    this[node.name.type](node.name, state);
    if (node.value !== null) { state.write("="); this[node.value.type](node.value, state); }
  },
  JSXSpreadAttribute(node: any, state: any) {
    state.write("{..."); this[node.argument.type](node.argument, state); state.write("}");
  },
  JSXExpressionContainer(node: any, state: any) {
    state.write("{");
    if (node.expression.type !== "JSXEmptyExpression") this[node.expression.type](node.expression, state);
    state.write("}");
  },
  JSXEmptyExpression(_node: any, _state: any) {},
  JSXText(node: any, state: any) { state.write(node.value); },
  JSXOpeningFragment(_node: any, state: any) { state.write("<>"); },
  JSXClosingFragment(_node: any, state: any) { state.write("</>"); },
  // TypeScript nodes: strip type-only constructs, pass through expressions
  TSTypeAnnotation(_node: any, _state: any) {},
  TSTypeParameterDeclaration(_node: any, _state: any) {},
  TSTypeParameterInstantiation(_node: any, _state: any) {},
  TSInterfaceDeclaration(_node: any, _state: any) {},
  TSTypeAliasDeclaration(_node: any, _state: any) {},
  TSEnumDeclaration(_node: any, _state: any) {},
  TSModuleDeclaration(_node: any, _state: any) {},
  TSImportEqualsDeclaration(_node: any, _state: any) {},
  TSExportAssignment(_node: any, _state: any) {},
  TSNamespaceExportDeclaration(_node: any, _state: any) {},
  TSAsExpression(node: any, state: any) { this[node.expression.type](node.expression, state); },
  TSSatisfiesExpression(node: any, state: any) { this[node.expression.type](node.expression, state); },
  TSNonNullExpression(node: any, state: any) { this[node.expression.type](node.expression, state); },
  TSTypeAssertion(node: any, state: any) { this[node.expression.type](node.expression, state); },
  TSInstantiationExpression(node: any, state: any) { this[node.expression.type](node.expression, state); },
  TSParameterProperty(node: any, state: any) { this[node.parameter.type](node.parameter, state); },
};

function toRelativeSource(filename: string, loc: Location, projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const relativePath = filename.startsWith(root) ? filename.slice(root.length + 1) : filename;
  return `${relativePath}:${loc.line}:${loc.column + 1}`;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isReactElementFactoryCall(node: CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === "Identifier") {
    return ["jsx", "jsxs", "jsxDEV", "_jsx", "_jsxs", "_jsxDEV", "createElement"].includes(
      (callee as Identifier).name,
    );
  }
  if (callee.type === "MemberExpression") {
    const obj = (callee as MemberExpression).object;
    const prop = (callee as MemberExpression).property;
    if (
      obj.type === "Identifier" && (obj as Identifier).name === "React" &&
      prop.type === "Identifier" && (prop as Identifier).name === "createElement"
    ) return true;
  }
  return false;
}

function isSupportedComponentInit(node: Node | null): boolean {
  if (!node) return false;
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return true;
  if (node.type !== "CallExpression") return false;
  const callee = (node as CallExpression).callee;
  if (callee.type === "Identifier") {
    return ["memo", "forwardRef"].includes((callee as Identifier).name);
  }
  if (callee.type === "MemberExpression") {
    const obj = (callee as MemberExpression).object;
    const prop = (callee as MemberExpression).property;
    if (obj.type === "Identifier" && (obj as Identifier).name === "React" && prop.type === "Identifier") {
      return ["memo", "forwardRef"].includes((prop as Identifier).name);
    }
  }
  return false;
}

function createSourceAssignment(name: string, sourceValue: string): ExpressionStatement {
  return {
    type: "ExpressionStatement",
    expression: {
      type: "AssignmentExpression",
      operator: "=",
      left: {
        type: "MemberExpression",
        object: { type: "Identifier", name },
        property: { type: "Identifier", name: SOURCE_PROP },
        computed: false,
      } as MemberExpression,
      right: { type: "Literal", value: sourceValue },
    } as AssignmentExpression,
  };
}

function createMarkElementHelper(): FunctionDeclaration {
  const code = `
function _markReactElementSource(element, source) {
  const registryKey = Symbol.for("${JSX_SOURCE_REGISTRY_SYMBOL}");
  let registry = globalThis[registryKey];
  if (!(registry instanceof WeakMap)) {
    registry = globalThis[registryKey] = new WeakMap();
  }
  if (element && typeof element === "object" && typeof element.props === "object") {
    registry.set(element.props, source);
  }
  return element;
}
`;
  return ParserTS.parse(code, { ecmaVersion: "latest", sourceType: "module" })
    .body[0] as unknown as FunctionDeclaration;
}

function wrapWithMarkElement(node: Node, sourceValue: string): CallExpression {
  return {
    type: "CallExpression",
    callee: { type: "Identifier", name: "_markReactElementSource" },
    arguments: [node as any, { type: "Literal", value: sourceValue }],
    optional: false,
  };
}

export function transformSource(
  code: string,
  options: TransformOptions,
): { code: string; map?: any } | null {
  const {
    filename,
    projectRoot = process.cwd(),
    injectJsxSource = true,
    injectComponentSource = true,
  } = options;

  let ast: Program;
  try {
    ast = getParser(filename).parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    }) as unknown as Program;
  } catch {
    return null;
  }

  let modified = false;
  let needsHelper = false;
  const seenComponents = new Set<string>();
  const wrappedNodes = new WeakSet();
  const assignments: Array<{ node: Node; parent: Node | null; assignment: ExpressionStatement }> = [];

  walk(ast as any, {
    enter(node: any, parent: any) {
      if (injectJsxSource && node.type === "CallExpression" && isReactElementFactoryCall(node) && !wrappedNodes.has(node)) {
        const loc = node.loc;
        if (loc) {
          wrappedNodes.add(node);
          this.replace(wrapWithMarkElement(node, toRelativeSource(filename, loc.start, projectRoot)));
          needsHelper = true;
          modified = true;
        }
      }

      if (injectComponentSource && node.type === "FunctionDeclaration") {
        const name = node.id?.name;
        if (name && isComponentName(name) && !seenComponents.has(name) && node.loc) {
          assignments.push({ node, parent, assignment: createSourceAssignment(name, toRelativeSource(filename, node.loc.start, projectRoot)) });
          seenComponents.add(name);
          modified = true;
        }
      }

      if (injectComponentSource && node.type === "VariableDeclarator") {
        const id = node.id;
        if (id.type === "Identifier" && isComponentName(id.name) && !seenComponents.has(id.name)) {
          const init = node.init;
          if (init && isSupportedComponentInit(init)) {
            const loc = node.loc || init.loc;
            if (loc) {
              assignments.push({ node, parent, assignment: createSourceAssignment(id.name, toRelativeSource(filename, loc.start, projectRoot)) });
              seenComponents.add(id.name);
              modified = true;
            }
          }
        }
      }
    },
  });

  if (!modified) return null;

  if (needsHelper) {
    const helper = createMarkElementHelper();
    const exists = ast.body.some(
      (n) => n.type === "FunctionDeclaration" && (n as FunctionDeclaration).id?.name === "_markReactElementSource",
    );
    if (!exists) ast.body.unshift(helper);
  }

  for (const { node, parent, assignment } of assignments.reverse()) {
    if (parent?.type === "Program") {
      const index = ast.body.indexOf(node as any);
      if (index !== -1) ast.body.splice(index + 1, 0, assignment as any);
    } else if (parent?.type === "ExportNamedDeclaration") {
      const exportNode = (ast as any).body.find(
        (n: any) => n.type === "ExportNamedDeclaration" && n.declaration === parent,
      );
      if (exportNode) ast.body.splice(ast.body.indexOf(exportNode) + 1, 0, assignment as any);
    } else if (parent?.type === "ExportDefaultDeclaration") {
      ast.body.splice(ast.body.indexOf(parent as any) + 1, 0, assignment as any);
    }
  }

  return { code: generate(ast as any, { generator: jsxGenerator }) };
}
