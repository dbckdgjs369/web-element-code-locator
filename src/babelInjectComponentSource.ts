import path from "node:path";
import { types as t, type NodePath, type PluginObj } from "@babel/core";
import { SOURCE_PROP } from "./constants";

type BabelState = {
  file?: {
    opts?: {
      filename?: string;
    };
  };
};

function isComponentName(name: string) {
  return /^[A-Z]/.test(name);
}

function getSourceValue(state: BabelState, loc: { line: number; column: number } | null | undefined) {
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

function visitDeclaration(
  declarationPath: NodePath,
  insertAfterPath: NodePath,
  state: BabelState,
  seen: Set<string>,
) {
  if (declarationPath.isFunctionDeclaration() || declarationPath.isClassDeclaration()) {
    const name = declarationPath.node.id?.name;
    if (!name || !isComponentName(name) || seen.has(name)) {
      return;
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

  const assignments = declarationPath.node.declarations.flatMap((declarator) => {
    if (!t.isIdentifier(declarator.id) || !isComponentName(declarator.id.name) || seen.has(declarator.id.name)) {
      return [];
    }

    if (!declarator.init) {
      return [];
    }

    if (!t.isArrowFunctionExpression(declarator.init) && !t.isFunctionExpression(declarator.init)) {
      return [];
    }

    const sourceValue = getSourceValue(state, declarator.loc?.start ?? declarator.init.loc?.start);
    if (!sourceValue) {
      return [];
    }

    seen.add(declarator.id.name);
    return [buildAssignment(declarator.id.name, sourceValue)];
  });

  if (assignments.length > 0) {
    insertAfterPath.insertAfter(assignments);
  }
}

export function babelInjectComponentSource(): PluginObj<BabelState> {
  return {
    name: "babel-inject-component-source",
    visitor: {
      JSXOpeningElement(pathNode, state) {
        const hasSourceProp = pathNode.node.attributes.some(
          (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === "__source",
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
            t.jsxIdentifier("__source"),
            t.jsxExpressionContainer(
              t.objectExpression([
                t.objectProperty(t.identifier("fileName"), t.stringLiteral(filename)),
                t.objectProperty(t.identifier("lineNumber"), t.numericLiteral(loc.line)),
                t.objectProperty(t.identifier("columnNumber"), t.numericLiteral(loc.column + 1)),
              ]),
            ),
          ),
        );
      },
      Program(programPath, state) {
        const seen = new Set<string>();

        for (const childPath of programPath.get("body")) {
          if (childPath.isExportNamedDeclaration() || childPath.isExportDefaultDeclaration()) {
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
