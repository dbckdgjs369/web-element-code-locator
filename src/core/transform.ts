/**
 * Zero-dependency source transform using acorn
 * No Babel required - pure JavaScript AST manipulation
 */

import { parse, type Node as AcornNode } from "acorn";
import { generate } from "astring";
import { walk } from "estree-walker";
import type {
  Node,
  Program,
  FunctionDeclaration,
  FunctionExpression,
  ArrowFunctionExpression,
  VariableDeclarator,
  CallExpression,
  MemberExpression,
  Identifier,
  ExpressionStatement,
  AssignmentExpression,
} from "estree";
import { SOURCE_PROP, JSX_SOURCE_PROP, JSX_SOURCE_REGISTRY_SYMBOL } from "../constants";

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

function toRelativeSource(filename: string, loc: Location, projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const relativePath = filename.startsWith(root) 
    ? filename.slice(root.length + 1) 
    : filename;
  return `${relativePath}:${loc.line}:${loc.column + 1}`;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isReactElementFactoryCall(node: CallExpression): boolean {
  const callee = node.callee;
  
  if (callee.type === "Identifier") {
    const name = callee.name;
    return [
      "jsx", "jsxs", "jsxDEV",
      "_jsx", "_jsxs", "_jsxDEV",
      "createElement"
    ].includes(name);
  }
  
  // React.createElement
  if (callee.type === "MemberExpression") {
    const obj = callee.object;
    const prop = callee.property;
    if (obj.type === "Identifier" && obj.name === "React" && 
        prop.type === "Identifier" && prop.name === "createElement") {
      return true;
    }
  }
  
  return false;
}

function isSupportedComponentInit(
  node: Node | null
): boolean {
  if (!node) return false;
  
  if (node.type === "ArrowFunctionExpression" || 
      node.type === "FunctionExpression") {
    return true;
  }
  
  if (node.type !== "CallExpression") return false;
  
  const callee = node.callee;
  if (callee.type === "Identifier") {
    return ["memo", "forwardRef"].includes(callee.name);
  }
  
  // React.memo, React.forwardRef
  if (callee.type === "MemberExpression") {
    const obj = callee.object;
    const prop = callee.property;
    if (obj.type === "Identifier" && obj.name === "React" && 
        prop.type === "Identifier") {
      return ["memo", "forwardRef"].includes(prop.name);
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
  return parse(code, { ecmaVersion: "latest" }).body[0] as FunctionDeclaration;
}

function wrapWithMarkElement(
  node: Node,
  sourceValue: string
): CallExpression {
  return {
    type: "CallExpression",
    callee: { type: "Identifier", name: "_markReactElementSource" },
    arguments: [node as any, { type: "Literal", value: sourceValue }],
    optional: false,
  };
}

export function transformSource(
  code: string,
  options: TransformOptions
): { code: string; map?: any } | null {
  const {
    filename,
    projectRoot = process.cwd(),
    injectJsxSource = true,
    injectComponentSource = true,
  } = options;

  // Parse with acorn
  let ast: Program;
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
      locations: true,
      ranges: true,
    } as any) as Program;
  } catch (err) {
    // Parse error - return null to skip this file
    return null;
  }

  let modified = false;
  let needsHelper = false;
  const seenComponents = new Set<string>();
  const assignments: Array<{ node: Node; parent: Node | null; assignment: ExpressionStatement }> = [];

  walk(ast as any, {
    enter(node: any, parent: any, key: any, index: any) {
      // Inject JSX source for element factory calls
      if (injectJsxSource && node.type === "CallExpression") {
        if (isReactElementFactoryCall(node)) {
          const loc = node.loc;
          if (loc) {
            const sourceValue = toRelativeSource(filename, loc.start, projectRoot);
            const wrapped = wrapWithMarkElement(node, sourceValue);
            
            // Replace the node
            this.replace(wrapped);
            needsHelper = true;
            modified = true;
          }
        }
      }

      // Inject JSX source for JSX elements
      if (injectJsxSource && node.type === "JSXElement") {
        const opening = node.openingElement;
        const loc = opening.loc;
        
        if (loc) {
          const sourceValue = toRelativeSource(filename, loc.start, projectRoot);
          
          // Check if intrinsic element (lowercase) or component (uppercase)
          const name = opening.name;
          if (name.type === "JSXIdentifier") {
            if (name.name[0] === name.name[0].toLowerCase()) {
              // Intrinsic element - use _markReactElementSource
              // This is handled by the CallExpression visitor for jsx()
              // But for JSX syntax directly, we need different handling
            } else {
              // Component - add $componentSourceLoc prop
              const sourceAttr = {
                type: "JSXAttribute",
                name: { type: "JSXIdentifier", name: JSX_SOURCE_PROP },
                value: { type: "Literal", value: sourceValue },
              };
              opening.attributes.push(sourceAttr);
              modified = true;
            }
          }
        }
      }

      // Inject component source for function declarations
      if (injectComponentSource && node.type === "FunctionDeclaration") {
        const name = node.id?.name;
        if (name && isComponentName(name) && !seenComponents.has(name)) {
          const loc = node.loc;
          if (loc) {
            const sourceValue = toRelativeSource(filename, loc.start, projectRoot);
            const assignment = createSourceAssignment(name, sourceValue);
            assignments.push({ node, parent, assignment });
            seenComponents.add(name);
            modified = true;
          }
        }
      }

      // Inject component source for variable declarations
      if (injectComponentSource && node.type === "VariableDeclarator") {
        const id = node.id;
        if (id.type === "Identifier" && isComponentName(id.name) && !seenComponents.has(id.name)) {
          const init = node.init;
          if (init && isSupportedComponentInit(init)) {
            const loc = node.loc || init.loc;
            if (loc) {
              const sourceValue = toRelativeSource(filename, loc.start, projectRoot);
              const assignment = createSourceAssignment(id.name, sourceValue);
              assignments.push({ node, parent, assignment });
              seenComponents.add(id.name);
              modified = true;
            }
          }
        }
      }
    },
  });

  if (!modified) {
    return null;
  }

  // Insert helper function if needed
  if (needsHelper) {
    const helper = createMarkElementHelper();
    // Check if already exists
    const exists = ast.body.some(
      (n) => n.type === "FunctionDeclaration" && 
             n.id?.name === "_markReactElementSource"
    );
    if (!exists) {
      ast.body.unshift(helper);
    }
  }

  // Insert component source assignments
  // We need to insert after the declaration, so we process in reverse order
  for (const { node, parent, assignment } of assignments.reverse()) {
    if (parent && parent.type === "Program") {
      const index = ast.body.indexOf(node as any);
      if (index !== -1) {
        ast.body.splice(index + 1, 0, assignment as any);
      }
    } else if (parent && parent.type === "ExportNamedDeclaration") {
      // For export const Component = ...
      // Insert after the export statement
      const exportParent = (ast as any).body.find((n: any) => 
        n.type === "ExportNamedDeclaration" && n.declaration === parent
      );
      if (exportParent) {
        const index = ast.body.indexOf(exportParent);
        ast.body.splice(index + 1, 0, assignment as any);
      }
    } else if (parent && parent.type === "ExportDefaultDeclaration") {
      // For export default function Component() ...
      const index = ast.body.indexOf(parent as any);
      ast.body.splice(index + 1, 0, assignment as any);
    }
  }

  // Generate code
  const result = generate(ast as any, { indent: "  " });

  return { code: result };
}
