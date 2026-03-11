import path from "node:path";
import type { PluginObj } from "@babel/core";
import type { NodePath } from "@babel/core";
import type * as BabelTypes from "@babel/types";

type BabelState = {
  file?: {
    opts?: {
      filename?: string;
    };
  };
};

export function babelInjectSourceLoc(): PluginObj<BabelState> {
  return {
    name: "babel-inject-source-loc",
    visitor: {
      JSXOpeningElement(pathNode: NodePath<BabelTypes.JSXOpeningElement>, state: BabelState) {
        const attrs = pathNode.node.attributes;
        const hasSourceLoc = attrs.some(
          (attr) =>
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "data-source-loc",
        );

        if (hasSourceLoc) {
          return;
        }

        const filename = state.file?.opts?.filename;
        const loc = pathNode.node.loc?.start;
        if (!filename || !loc) {
          return;
        }

        const relPath = path.relative(process.cwd(), filename).replace(/\\/g, "/");
        const value = `${relPath}:${loc.line}:${loc.column + 1}`;

        attrs.push({
          type: "JSXAttribute",
          name: {
            type: "JSXIdentifier",
            name: "data-source-loc",
          },
          value: {
            type: "StringLiteral",
            value,
          },
        });
      },
    },
  };
}
