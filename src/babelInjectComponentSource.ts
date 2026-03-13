import { types as t, type NodePath, type PluginObj } from "@babel/core";
import { JSX_SOURCE_REGISTRY_SYMBOL, SOURCE_PROP } from "./constants";
import type { SourceInjectionOptions } from "./sourceAdapter";
import { toRelativeSource } from "./sourceMetadata";

export type BabelInjectComponentSourceOptions = SourceInjectionOptions;

type BabelState = {
  file?: {
    opts?: {
      filename?: string;
    };
  };
  injectedIntrinsicHelper?: boolean;
};

function isComponentName(name: string) {
  return /^[A-Z]/.test(name);
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

function getSourceValue(
  state: BabelState,
  loc: { line: number; column: number } | null | undefined,
  projectRoot?: string,
) {
  const filename = state.file?.opts?.filename;
  if (!filename || !loc) {
    return null;
  }

  return toRelativeSource(filename, loc, projectRoot);
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

function buildElementSourceHelper() {
  return t.functionDeclaration(
    t.identifier("_markReactElementSource"),
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

function ensureElementSourceHelper(programPath: NodePath<t.Program>, state: BabelState) {
  if (state.injectedIntrinsicHelper) {
    return;
  }

  const alreadyExists = programPath.node.body.some(
    (node: t.Statement) =>
      t.isFunctionDeclaration(node) && t.isIdentifier(node.id, { name: "_markReactElementSource" }),
  );
  if (!alreadyExists) {
    programPath.unshiftContainer("body", buildElementSourceHelper());
  }

  state.injectedIntrinsicHelper = true;
}

function visitDeclaration(
  declarationPath: NodePath,
  insertAfterPath: NodePath,
  state: BabelState,
  seen: Set<string>,
  projectRoot?: string,
) {
  if (
    declarationPath.isFunctionDeclaration() ||
    declarationPath.isClassDeclaration()
  ) {
    const name = declarationPath.node.id?.name;
    if (!name || !isComponentName(name) || seen.has(name)) {
      return;
    }

    const sourceValue = getSourceValue(
      state,
      declarationPath.node.loc?.start,
      projectRoot,
    );
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
    (declarator: t.VariableDeclarator) => {
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

      const sourceValue = getSourceValue(
        state,
        declarator.loc?.start ?? declarator.init.loc?.start,
        projectRoot,
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
  const {
    injectJsxSource = true,
    injectComponentSource = true,
    projectRoot,
  } = options;

  return {
    name: "babel-inject-component-source",
    visitor: {
      CallExpression(pathNode: NodePath<t.CallExpression>, state: BabelState) {
        if (!injectJsxSource) {
          return;
        }

        if (!isReactElementFactoryCall(pathNode)) {
          return;
        }

        if (
          pathNode.parentPath.isCallExpression() &&
          t.isIdentifier(pathNode.parentPath.node.callee, {
            name: "_markReactElementSource",
          })
        ) {
          return;
        }

        const sourceValue = getSourceValue(
          state,
          pathNode.node.loc?.start,
          projectRoot,
        );
        if (!sourceValue) {
          return;
        }

        const programPath = pathNode.findParent((parent: NodePath) => parent.isProgram());
        if (!programPath || !programPath.isProgram()) {
          return;
        }

        ensureElementSourceHelper(programPath, state);
        pathNode.replaceWith(
          t.callExpression(t.identifier("_markReactElementSource"), [
            pathNode.node,
            t.stringLiteral(sourceValue),
          ]),
        );
        pathNode.skip();
      },
      JSXElement: {
        exit(pathNode: NodePath<t.JSXElement>, state: BabelState) {
          if (!injectJsxSource) {
            return;
          }

          if (
            pathNode.parentPath.isCallExpression() &&
            t.isIdentifier(pathNode.parentPath.node.callee, { name: "_markReactElementSource" })
          ) {
            return;
          }

          const sourceValue = getSourceValue(
            state,
            pathNode.node.openingElement.loc?.start,
            projectRoot,
          );
          if (!sourceValue) {
            return;
          }

          const programPath = pathNode.findParent((parent: NodePath) => parent.isProgram());
          if (!programPath || !programPath.isProgram()) {
            return;
          }

          ensureElementSourceHelper(programPath, state);

          const wrappedNode = t.callExpression(t.identifier("_markReactElementSource"), [
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
      Program(programPath: NodePath<t.Program>, state: BabelState) {
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
              visitDeclaration(declarationPath, childPath, state, seen, projectRoot);
            }
            continue;
          }

          visitDeclaration(childPath, childPath, state, seen, projectRoot);
        }
      },
    },
  };
}
