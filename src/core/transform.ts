/**
 * Source transform using acorn + acorn-typescript + acorn-jsx
 * Pure JS, fully bundlable, no native bindings required
 *
 * Strategy: parse AST to find positions, then inject via string manipulation
 * (no code regeneration — preserves original TypeScript/JSX exactly)
 */

import * as acorn from "acorn";
import acornJsx from "acorn-jsx";
import acornTs from "acorn-typescript";
import { walk } from "estree-walker";
import MagicString from "magic-string";
import type { Node, Program, CallExpression, MemberExpression, Identifier } from "estree";
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

function toRelativeSource(filename: string, loc: Location, projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const relativePath = filename.startsWith(root) ? filename.slice(root.length + 1) : filename;
  return `${relativePath}:${loc.line}:${loc.column + 1}`;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
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

  const isJsx = /\.[jt]sx$/.test(filename);

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

  const insertions: Array<{ at: number; text: string; mode?: "prepend" }> = [];
  let needsJsxHelper = false;

  const seenComponents = new Set<string>();
  const parentStack: any[] = [];

  walk(ast as any, {
    enter(node: any) {
      const parent = parentStack[parentStack.length - 1] ?? null;
      const grandparent = parentStack[parentStack.length - 2] ?? null;

      // Wrap JSX elements with __rcl() to register source in WeakMap without polluting props
      if (injectJsxSource && isJsx && node.type === "JSXElement") {
        if (node.loc) {
          const sourceValue = toRelativeSource(filename, node.loc.start, projectRoot);
          // Direct JSX children need {__rcl(...)} — otherwise the text `__rcl(` becomes a DOM text node
          const inJsxContext = parent?.type === "JSXElement" || parent?.type === "JSXFragment";
          const open = inJsxContext ? `{__rcl(` : `__rcl(`;
          const close = inJsxContext ? `, "${sourceValue}")}` : `, "${sourceValue}")`;
          insertions.push({ at: node.start, text: open, mode: "prepend" });
          insertions.push({ at: node.end, text: close });
          needsJsxHelper = true;
        }
      }

      // Inject __componentSourceLoc on function declarations
      if (injectComponentSource && node.type === "FunctionDeclaration") {
        const name = node.id?.name;
        const isTopLevel =
          parent?.type === "Program" ||
          parent?.type === "ExportNamedDeclaration" ||
          parent?.type === "ExportDefaultDeclaration";
        if (name && isComponentName(name) && isTopLevel && !seenComponents.has(name) && node.loc) {
          seenComponents.add(name);
          const sourceValue = toRelativeSource(filename, node.loc.start, projectRoot);
          const insertAfter: number | undefined =
            parent?.type === "ExportNamedDeclaration" || parent?.type === "ExportDefaultDeclaration"
              ? parent.end
              : node.end;
          if (insertAfter !== undefined) {
            insertions.push({ at: insertAfter, text: `\n${name}.${SOURCE_PROP} = "${sourceValue}";` });
          }
        }
      }

      // Inject __componentSourceLoc on variable component declarations
      if (injectComponentSource && node.type === "VariableDeclarator") {
        const id = node.id;
        const isTopLevel =
          parent?.type === "VariableDeclaration" &&
          (grandparent?.type === "Program" ||
            grandparent?.type === "ExportNamedDeclaration" ||
            grandparent?.type === "ExportDefaultDeclaration");
        if (
          id.type === "Identifier" &&
          isComponentName(id.name) &&
          isTopLevel &&
          !seenComponents.has(id.name)
        ) {
          const init = node.init;
          if (init && isSupportedComponentInit(init)) {
            const loc = node.loc || init.loc;
            if (loc) {
              seenComponents.add(id.name);
              const sourceValue = toRelativeSource(filename, loc.start, projectRoot);
              const insertAfter: number | undefined =
                grandparent?.type === "ExportNamedDeclaration" ||
                grandparent?.type === "ExportDefaultDeclaration"
                  ? grandparent.end
                  : parent?.end;
              if (insertAfter !== undefined) {
                insertions.push({ at: insertAfter, text: `\n${id.name}.${SOURCE_PROP} = "${sourceValue}";` });
              }
            }
          }
        }
      }

      parentStack.push(node);
    },
    leave() {
      parentStack.pop();
    },
  });

  if (needsJsxHelper) {
    let helperPos = 0;
    for (const n of ast.body) {
      if (n.type === "ImportDeclaration") helperPos = (n as any).end;
    }
    insertions.push({
      at: helperPos,
      text: `\nvar __rcl_r=(globalThis[Symbol.for("${JSX_SOURCE_REGISTRY_SYMBOL}")]||(globalThis[Symbol.for("${JSX_SOURCE_REGISTRY_SYMBOL}")]=new WeakMap()));function __rcl(e,s){if(e&&e.props)__rcl_r.set(e.props,s);return e;}\n`,
    });
  }

  if (insertions.length === 0) return null;

  const s = new MagicString(code);
  for (const { at, text, mode } of insertions) {
    if (mode === "prepend") {
      s.prependLeft(at, text);
    } else {
      s.appendLeft(at, text);
    }
  }

  return { code: s.toString(), map: s.generateMap({ hires: true }) };
}
