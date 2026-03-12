import path from "node:path";
import { types as t, type NodePath, type PluginObj } from "@babel/core";
import {
  JSX_SOURCE_PROP,
  JSX_SOURCE_REGISTRY_SYMBOL,
  SOURCE_PROP,
} from "./constants";

export type BabelInjectComponentSourceOptions = {
  injectJsxSource?: boolean;
  injectComponentSource?: boolean;
};

type BabelState = {
  file?: {
    opts?: {
      filename?: string;
    };
  };
  injectedIntrinsicHelper?: boolean;
};

type BindingLike = {
  path: NodePath;
};

const SOURCE_PROP_LOCAL = "_componentSourceLoc";
const SOURCE_PROPS_REST = "__reactCodeLocatorProps";

function isComponentName(name: string) {
  return /^[A-Z]/.test(name);
}

function isCustomComponentTag(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
) {
  if (t.isJSXIdentifier(name)) {
    return isComponentName(name.name);
  }

  if (t.isJSXMemberExpression(name)) {
    return true;
  }

  return false;
}

function isIntrinsicElementTag(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
) {
  return t.isJSXIdentifier(name) && /^[a-z]/.test(name.name);
}

function isElementFactoryIdentifier(name: string) {
  return (
    name === "jsx" ||
    name === "jsxs" ||
    name === "jsxDEV" ||
    name === "_jsx" ||
    name === "_jsxs" ||
    name === "_jsxDEV" ||
    name === "createElement"
  );
}

function isReactElementFactoryCall(pathNode: NodePath<t.CallExpression>) {
  const callee = pathNode.node.callee;

  if (t.isIdentifier(callee)) {
    return isElementFactoryIdentifier(callee.name);
  }

  return (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.object, { name: "React" }) &&
    t.isIdentifier(callee.property, { name: "createElement" })
  );
}

function getRootJsxIdentifierName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string | null {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  if (t.isJSXMemberExpression(name)) {
    return getRootJsxIdentifierName(name.object);
  }

  return null;
}

function isStyledModuleImport(binding: BindingLike | undefined) {
  if (!binding) {
    return false;
  }

  if (
    !binding.path.isImportSpecifier() &&
    !binding.path.isImportDefaultSpecifier() &&
    !binding.path.isImportNamespaceSpecifier()
  ) {
    return false;
  }

  const source = binding.path.parentPath.isImportDeclaration()
    ? binding.path.parentPath.node.source.value
    : null;
  if (typeof source !== "string") {
    return false;
  }

  const normalized = source.replace(/\\/g, "/");
  return (
    normalized === "./styled" ||
    normalized === "../styled" ||
    normalized.endsWith("/styled")
  );
}

function isExternalToProjectRoot(filename: string | undefined) {
  if (!filename) {
    return false;
  }

  const relativePath = path
    .relative(process.cwd(), filename)
    .replace(/\\/g, "/");
  return relativePath.startsWith("../");
}

function isSupportedComponentInit(
  node: t.Expression | null | undefined,
): boolean {
  if (!node) {
    return false;
  }

  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    return true;
  }

  if (!t.isCallExpression(node)) {
    return false;
  }

  if (
    t.isIdentifier(node.callee) &&
    (node.callee.name === "memo" || node.callee.name === "forwardRef")
  ) {
    return true;
  }

  return (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object, { name: "React" }) &&
    t.isIdentifier(node.callee.property) &&
    (node.callee.property.name === "memo" ||
      node.callee.property.name === "forwardRef")
  );
}

function hasSourcePropBinding(pattern: t.ObjectPattern) {
  return pattern.properties.some((property) => {
    if (!t.isObjectProperty(property)) {
      return false;
    }

    return (
      t.isIdentifier(property.key) && property.key.name === JSX_SOURCE_PROP
    );
  });
}

function injectSourcePropBinding(pattern: t.ObjectPattern) {
  if (hasSourcePropBinding(pattern)) {
    return;
  }

  const sourceBinding = t.objectProperty(
    t.identifier(JSX_SOURCE_PROP),
    t.identifier(SOURCE_PROP_LOCAL),
    false,
    false,
  );

  const restIndex = pattern.properties.findIndex((property) =>
    t.isRestElement(property),
  );
  if (restIndex === -1) {
    pattern.properties.push(sourceBinding);
    return;
  }

  pattern.properties.splice(restIndex, 0, sourceBinding);
}

function injectSourcePropIntoIdentifierParam(
  node:
    | t.FunctionDeclaration
    | t.FunctionExpression
    | t.ArrowFunctionExpression,
  param: t.Identifier,
) {
  if (!t.isBlockStatement(node.body)) {
    node.body = t.blockStatement([t.returnStatement(node.body)]);
  }

  const alreadyInjected = node.body.body.some(
    (statement) =>
      t.isVariableDeclaration(statement) &&
      statement.declarations.some(
        (declaration) =>
          t.isIdentifier(declaration.id) &&
          declaration.id.name === SOURCE_PROPS_REST,
      ),
  );
  if (alreadyInjected) {
    return;
  }

  node.body.body.unshift(
    t.variableDeclaration("const", [
      t.variableDeclarator(
        t.objectPattern([
          t.objectProperty(
            t.identifier(JSX_SOURCE_PROP),
            t.identifier(SOURCE_PROP_LOCAL),
            false,
            false,
          ),
          t.restElement(t.identifier(SOURCE_PROPS_REST)),
        ]),
        param,
      ),
    ]),
    t.expressionStatement(
      t.assignmentExpression(
        "=",
        t.identifier(param.name),
        t.identifier(SOURCE_PROPS_REST),
      ),
    ),
  );
}

function injectSourcePropIntoFunctionParams(
  node:
    | t.FunctionDeclaration
    | t.FunctionExpression
    | t.ArrowFunctionExpression,
) {
  const firstParam = node.params[0];
  if (!firstParam) {
    return;
  }

  if (t.isObjectPattern(firstParam)) {
    injectSourcePropBinding(firstParam);
    return;
  }

  if (t.isIdentifier(firstParam)) {
    injectSourcePropIntoIdentifierParam(node, firstParam);
  }
}

function injectSourcePropIntoExpression(node: t.Expression | null | undefined) {
  if (!node) {
    return;
  }

  if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
    injectSourcePropIntoFunctionParams(node);
    return;
  }

  if (!t.isCallExpression(node)) {
    return;
  }

  const firstArg = node.arguments[0];
  if (
    firstArg &&
    !t.isSpreadElement(firstArg) &&
    (t.isFunctionExpression(firstArg) || t.isArrowFunctionExpression(firstArg))
  ) {
    injectSourcePropIntoFunctionParams(firstArg);
  }
}

function getSourceValue(
  state: BabelState,
  loc: { line: number; column: number } | null | undefined,
) {
  const filename = state.file?.opts?.filename;
  if (!filename || !loc) {
    return null;
  }

  const relPath = path.relative(process.cwd(), filename).replace(/\\/g, "/");
  return `${relPath}:${loc.line}:${loc.column + 1}`;
}

function buildAssignment(name: string, sourceValue: string) {
  return t.expressionStatement(
    t.assignmentExpression(
      "=",
      t.memberExpression(t.identifier(name), t.identifier(SOURCE_PROP)),
      t.stringLiteral(sourceValue),
    ),
  );
}

function buildIntrinsicSourceHelper() {
  return t.functionDeclaration(
    t.identifier("_markIntrinsicElementSource"),
    [t.identifier("element"), t.identifier("source")],
    t.blockStatement([
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.identifier("registryKey"),
          t.callExpression(
            t.memberExpression(t.identifier("Symbol"), t.identifier("for")),
            [t.stringLiteral(JSX_SOURCE_REGISTRY_SYMBOL)],
          ),
        ),
      ]),
      t.variableDeclaration("let", [
        t.variableDeclarator(
          t.identifier("registry"),
          t.memberExpression(t.identifier("globalThis"), t.identifier("registryKey"), true),
        ),
      ]),
      t.ifStatement(
        t.unaryExpression(
          "!",
          t.binaryExpression("instanceof", t.identifier("registry"), t.identifier("WeakMap")),
        ),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.identifier("registry"),
              t.assignmentExpression(
                "=",
                t.memberExpression(t.identifier("globalThis"), t.identifier("registryKey"), true),
                t.newExpression(t.identifier("WeakMap"), []),
              ),
            ),
          ),
        ]),
      ),
      t.ifStatement(
        t.logicalExpression(
          "&&",
          t.identifier("element"),
          t.logicalExpression(
            "&&",
            t.binaryExpression("===", t.unaryExpression("typeof", t.identifier("element")), t.stringLiteral("object")),
            t.binaryExpression(
              "===",
              t.unaryExpression("typeof", t.memberExpression(t.identifier("element"), t.identifier("props"))),
              t.stringLiteral("object"),
            ),
          ),
        ),
        t.blockStatement([
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier("registry"), t.identifier("set")),
              [t.memberExpression(t.identifier("element"), t.identifier("props")), t.identifier("source")],
            ),
          ),
        ]),
      ),
      t.returnStatement(t.identifier("element")),
    ]),
  );
}

function ensureIntrinsicSourceHelper(programPath: NodePath<t.Program>, state: BabelState) {
  if (state.injectedIntrinsicHelper) {
    return;
  }

  const alreadyExists = programPath.node.body.some(
    (node) => t.isFunctionDeclaration(node) && t.isIdentifier(node.id, { name: "_markIntrinsicElementSource" }),
  );
  if (!alreadyExists) {
    programPath.unshiftContainer("body", buildIntrinsicSourceHelper());
  }

  state.injectedIntrinsicHelper = true;
}

function visitDeclaration(
  declarationPath: NodePath,
  insertAfterPath: NodePath,
  state: BabelState,
  seen: Set<string>,
) {
  if (
    declarationPath.isFunctionDeclaration() ||
    declarationPath.isClassDeclaration()
  ) {
    const name = declarationPath.node.id?.name;
    if (!name || !isComponentName(name) || seen.has(name)) {
      return;
    }

    if (declarationPath.isFunctionDeclaration()) {
      injectSourcePropIntoFunctionParams(declarationPath.node);
    }

    const sourceValue = getSourceValue(state, declarationPath.node.loc?.start);
    if (!sourceValue) {
      return;
    }

    seen.add(name);
    insertAfterPath.insertAfter(buildAssignment(name, sourceValue));
    return;
  }

  if (!declarationPath.isVariableDeclaration()) {
    return;
  }

  const assignments = declarationPath.node.declarations.flatMap(
    (declarator) => {
      if (
        !t.isIdentifier(declarator.id) ||
        !isComponentName(declarator.id.name) ||
        seen.has(declarator.id.name)
      ) {
        return [];
      }

      if (!declarator.init) {
        return [];
      }

      if (!isSupportedComponentInit(declarator.init)) {
        return [];
      }

      injectSourcePropIntoExpression(declarator.init);

      const sourceValue = getSourceValue(
        state,
        declarator.loc?.start ?? declarator.init.loc?.start,
      );
      if (!sourceValue) {
        return [];
      }

      seen.add(declarator.id.name);
      return [buildAssignment(declarator.id.name, sourceValue)];
    },
  );

  if (assignments.length > 0) {
    insertAfterPath.insertAfter(assignments);
  }
}

export function babelInjectComponentSource(
  options: BabelInjectComponentSourceOptions = {},
): PluginObj<BabelState> {
  const { injectJsxSource = true, injectComponentSource = true } = options;

  return {
    name: "babel-inject-component-source",
    visitor: {
      CallExpression(pathNode, state) {
        if (!injectJsxSource) {
          return;
        }

        if (!isReactElementFactoryCall(pathNode)) {
          return;
        }

        if (
          pathNode.parentPath.isCallExpression() &&
          t.isIdentifier(pathNode.parentPath.node.callee, {
            name: "_markIntrinsicElementSource",
          })
        ) {
          return;
        }

        const sourceValue = getSourceValue(state, pathNode.node.loc?.start);
        if (!sourceValue) {
          return;
        }

        const programPath = pathNode.findParent((parent) => parent.isProgram());
        if (!programPath || !programPath.isProgram()) {
          return;
        }

        ensureIntrinsicSourceHelper(programPath, state);
        pathNode.replaceWith(
          t.callExpression(t.identifier("_markIntrinsicElementSource"), [
            pathNode.node,
            t.stringLiteral(sourceValue),
          ]),
        );
        pathNode.skip();
      },
      JSXElement: {
        exit(pathNode, state) {
          if (!injectJsxSource) {
            return;
          }

          if (!isIntrinsicElementTag(pathNode.node.openingElement.name)) {
            return;
          }

          if (
            pathNode.parentPath.isCallExpression() &&
            t.isIdentifier(pathNode.parentPath.node.callee, { name: "_markIntrinsicElementSource" })
          ) {
            return;
          }

          const sourceValue = getSourceValue(state, pathNode.node.openingElement.loc?.start);
          if (!sourceValue) {
            return;
          }

          const programPath = pathNode.findParent((parent) => parent.isProgram());
          if (!programPath || !programPath.isProgram()) {
            return;
          }

          ensureIntrinsicSourceHelper(programPath, state);

          const wrappedNode = t.callExpression(t.identifier("_markIntrinsicElementSource"), [
            pathNode.node,
            t.stringLiteral(sourceValue),
          ]);

          if (pathNode.parentPath.isJSXElement() || pathNode.parentPath.isJSXFragment()) {
            pathNode.replaceWith(t.jsxExpressionContainer(wrappedNode));
            return;
          }

          if (pathNode.parentPath.isJSXExpressionContainer()) {
            pathNode.parentPath.replaceWith(t.jsxExpressionContainer(wrappedNode));
            return;
          }

          pathNode.replaceWith(wrappedNode);
        },
      },
      JSXOpeningElement(pathNode, state) {
        if (!injectJsxSource) {
          return;
        }

        if (!isCustomComponentTag(pathNode.node.name)) {
          return;
        }

        const rootIdentifierName = getRootJsxIdentifierName(pathNode.node.name);
        if (
          rootIdentifierName &&
          isExternalToProjectRoot(state.file?.opts?.filename) &&
          isStyledModuleImport(pathNode.scope.getBinding(rootIdentifierName))
        ) {
          return;
        }

        const hasSourceProp = pathNode.node.attributes.some(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name) &&
            attr.name.name === JSX_SOURCE_PROP,
        );
        if (hasSourceProp) {
          return;
        }

        const filename = state.file?.opts?.filename;
        const loc = pathNode.node.loc?.start;
        if (!filename || !loc) {
          return;
        }

        pathNode.node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier(JSX_SOURCE_PROP),
            t.stringLiteral(
              getSourceValue(state, loc) ??
                `${filename.replace(/\\/g, "/")}:${loc.line}:${loc.column + 1}`,
            ),
          ),
        );
      },
      Program(programPath, state) {
        if (!injectComponentSource) {
          return;
        }

        const seen = new Set<string>();

        for (const childPath of programPath.get("body")) {
          if (
            childPath.isExportNamedDeclaration() ||
            childPath.isExportDefaultDeclaration()
          ) {
            const declarationPath = childPath.get("declaration");
            if (!Array.isArray(declarationPath) && declarationPath.node) {
              visitDeclaration(declarationPath, childPath, state, seen);
            }
            continue;
          }

          visitDeclaration(childPath, childPath, state, seen);
        }
      },
    },
  };
}
