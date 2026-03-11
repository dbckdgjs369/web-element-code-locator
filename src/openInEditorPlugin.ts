import path from "node:path";
import type { Plugin } from "vite";

type OpenRequestBody = {
  source?: string;
};

function parseBody(payload: string): OpenRequestBody {
  try {
    return JSON.parse(payload) as OpenRequestBody;
  } catch {
    return {};
  }
}

function parseSourceLocation(source: string) {
  const match = source.match(/^(.*):(\d+):(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    file: match[1],
    line: match[2],
    column: match[3],
  };
}

export function openInEditorPlugin(): Plugin {
  return {
    name: "open-in-editor-plugin",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__open-in-editor", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk;
        });

        req.on("end", () => {
          const body = parseBody(raw);
          if (!body.source || typeof body.source !== "string") {
            res.statusCode = 400;
            res.end("invalid body: source is required");
            return;
          }

          const parsed = parseSourceLocation(body.source);
          if (!parsed) {
            res.statusCode = 400;
            res.end("invalid source format");
            return;
          }

          const absFile = path.resolve(server.config.root, parsed.file);
          const target = `${absFile}:${parsed.line}:${parsed.column}`;
          res.setHeader("content-type", "application/json");
          res.statusCode = 200;
          res.end(JSON.stringify({ source: body.source, absolutePath: target }));
        });
      });
    },
  };
}
