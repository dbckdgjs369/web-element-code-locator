/**
 * Source transform using @babel/parser
 * Pure JS, fully bundlable, no native bindings required
 *
 * @babel/parser tracks the TypeScript spec release-for-release, so newer syntax
 * (`satisfies`, const type parameters, decorators) parses without us chasing it.
 * Its only dependency is @babel/types; both are bundled into dist, so this stays
 * a zero-dependency package and never touches the host project's toolchain.
 *
 * Strategy: parse AST to find positions, then inject via string manipulation
 * (no code regeneration — preserves original TypeScript/JSX exactly)
 */

import { parse as babelParse, type ParserPlugin } from "@babel/parser";
import { walk } from "estree-walker";
import MagicString from "magic-string";
import type { Node, Program } from "estree";
import { SOURCE_PROP, JSX_SOURCE_REGISTRY_SYMBOL } from "../constants";

// JSX-capable extensions. `.ts` is intentionally excluded: it can't contain JSX
// and the JSX plugin would misparse `<T,>` generic arrow functions there.
// `.js` IS included — CRA and plenty of older projects put JSX in plain .js files.
const JSX_FILE_RE = /\.(jsx?|tsx)$/;

// Proposal syntax that ships in real TS codebases but sits behind a Babel plugin.
// `decorators-legacy` matches TS's `experimentalDecorators`, which is what almost
// every decorator-using project (MobX, InversifyJS, class-validator) compiles with.
const PROPOSAL_PLUGINS: ParserPlugin[] = [
  "explicitResourceManagement",
  "importAttributes",
  "decorators-legacy",
  "decoratorAutoAccessors",
];

// .tsx/.jsx/.js get the JSX plugin; .ts must not (it would misparse `<T,>` generic arrows).
const PLUGINS_TSX: ParserPlugin[] = ["typescript", "jsx", ...PROPOSAL_PLUGINS];
const PLUGINS_TS: ParserPlugin[] = ["typescript", ...PROPOSAL_PLUGINS];

function getParserPlugins(filename: string): ParserPlugin[] {
  return JSX_FILE_RE.test(filename) ? PLUGINS_TSX : PLUGINS_TS;
}

// A parse failure skips the whole file, and a skipped file looks exactly like a
// file with no components — so without this the user has no way to tell the
// plugin gave up. Warn once per file.
const warnedFiles = new Set<string>();

function warnParseFailure(filename: string, error: unknown) {
  if (warnedFiles.has(filename)) return;
  warnedFiles.add(filename);
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `[react-code-locator] Skipped "${filename}" — could not parse it, so components in this ` +
      `file will not be locatable. Reason: ${reason}`,
  );
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

// "direct"  -> init is literally a function/class expression; the value is guaranteed
//              to be an object/function, so the source assignment can be unguarded.
// "wrapped" -> init is a call (memo/forwardRef/connect/observer/withX/...) or a
//              styled`...` tagged template. The result is almost always a component,
//              but could be a primitive, so the assignment is type-guarded.
//              Allow-listing HOC names was the old approach and it missed every
//              project-local HOC, so any call is accepted and the guard absorbs the risk.
// null      -> not a component-producing initializer.
type ComponentInitKind = "direct" | "wrapped" | null;

function classifyComponentInit(node: Node | null | undefined): ComponentInitKind {
  if (!node) return null;
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "ClassExpression"
  ) {
    return "direct";
  }
  if (node.type === "CallExpression" || node.type === "TaggedTemplateExpression") {
    return "wrapped";
  }
  return null;
}

// A class counts as a component only if it extends a base class (React.Component /
// PureComponent / a project base class). Keeps plain uppercase data classes out.
function looksLikeComponentClass(node: any): boolean {
  return Boolean(node?.superClass);
}

// Statement contexts where inserting `Name.__componentSourceLoc = "..."` right after
// the declaration is syntactically valid. BlockStatement is what lets components
// declared inside another function (a very common pattern) be picked up too.
function isStatementContext(node: any): boolean {
  return (
    node?.type === "Program" ||
    node?.type === "BlockStatement" ||
    node?.type === "ExportNamedDeclaration" ||
    node?.type === "ExportDefaultDeclaration"
  );
}

function isExportWrapper(node: any): boolean {
  return (
    node?.type === "ExportNamedDeclaration" || node?.type === "ExportDefaultDeclaration"
  );
}

function buildAssignment(name: string, sourceValue: string, guarded: boolean): string {
  if (guarded) {
    // Short-circuits (never throws) when the value turned out to be a primitive/null.
    return `\n${name} && (typeof ${name} === "object" || typeof ${name} === "function") && (${name}.${SOURCE_PROP} = "${sourceValue}");`;
  }
  return `\n${name}.${SOURCE_PROP} = "${sourceValue}";`;
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

  const isJsx = JSX_FILE_RE.test(filename);

  let ast: Program;
  try {
    ast = babelParse(code, {
      sourceType: "module",
      plugins: getParserPlugins(filename),
    }).program as unknown as Program;
  } catch (error) {
    warnParseFailure(filename, error);
    return null;
  }

  const insertions: Array<{ at: number; text: string; mode?: "prepend" }> = [];
  let needsJsxHelper = false;

  // Dedupe by declaration position rather than by name, so same-named components in
  // different scopes (e.g. a nested `Row` and a top-level `Row`) are both annotated.
  const seenComponents = new Set<number>();
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

      // Inject __componentSourceLoc on function declarations (top-level or nested)
      if (injectComponentSource && node.type === "FunctionDeclaration") {
        const name = node.id?.name;
        if (
          name &&
          isComponentName(name) &&
          isStatementContext(parent) &&
          !seenComponents.has(node.start) &&
          node.loc
        ) {
          seenComponents.add(node.start);
          const sourceValue = toRelativeSource(filename, node.loc.start, projectRoot);
          const insertAfter: number | undefined = isExportWrapper(parent) ? parent.end : node.end;
          if (insertAfter !== undefined) {
            insertions.push({ at: insertAfter, text: buildAssignment(name, sourceValue, false) });
          }
        }
      }

      // Inject __componentSourceLoc on class components (top-level or nested)
      if (injectComponentSource && node.type === "ClassDeclaration") {
        const name = node.id?.name;
        if (
          name &&
          isComponentName(name) &&
          isStatementContext(parent) &&
          looksLikeComponentClass(node) &&
          !seenComponents.has(node.start) &&
          node.loc
        ) {
          seenComponents.add(node.start);
          const sourceValue = toRelativeSource(filename, node.loc.start, projectRoot);
          const insertAfter: number | undefined = isExportWrapper(parent) ? parent.end : node.end;
          if (insertAfter !== undefined) {
            insertions.push({ at: insertAfter, text: buildAssignment(name, sourceValue, false) });
          }
        }
      }

      // Inject __componentSourceLoc on variable component declarations.
      // Covers arrow/function/class expressions ("direct") and HOC/styled wrappers
      // ("wrapped"), at top level or nested inside a block.
      if (injectComponentSource && node.type === "VariableDeclarator") {
        const id = node.id;
        const declaration = parent; // VariableDeclaration
        const declContext = grandparent; // Program / BlockStatement / Export...
        const inStatementContext =
          declaration?.type === "VariableDeclaration" && isStatementContext(declContext);
        if (
          id.type === "Identifier" &&
          isComponentName(id.name) &&
          inStatementContext &&
          !seenComponents.has(node.start)
        ) {
          const kind = classifyComponentInit(node.init);
          if (kind) {
            const loc = node.loc || node.init.loc;
            if (loc) {
              seenComponents.add(node.start);
              const sourceValue = toRelativeSource(filename, loc.start, projectRoot);
              const insertAfter: number | undefined = isExportWrapper(declContext)
                ? declContext.end
                : declaration?.end;
              if (insertAfter !== undefined) {
                insertions.push({
                  at: insertAfter,
                  text: buildAssignment(id.name, sourceValue, kind === "wrapped"),
                });
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
