import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { LocatorMode, LocatorResult } from "./runtime";

const locatorModeSchema = z.enum(["direct", "screen", "implementation"]);

type BrowserPage = {
  pageId: string;
  url: string;
  title?: string;
};

type BrowserPingResult = {
  browserConnected: boolean;
  pageFound: boolean;
  runtimeAvailable: boolean;
  mode: LocatorMode;
  url?: string;
};

type SourceLocation = LocatorResult & {
  file: string;
  line: number;
  column: number;
};

export type LocatorToolErrorCode =
  | "BROWSER_NOT_CONNECTED"
  | "PAGE_NOT_FOUND"
  | "LOCATOR_RUNTIME_MISSING"
  | "ELEMENT_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "FILE_NOT_IN_WORKSPACE"
  | "INVALID_ARGUMENT";

export class LocatorToolError extends Error {
  code: LocatorToolErrorCode;

  constructor(code: LocatorToolErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type LocatorBrowserBridge = {
  listPages: () => Promise<BrowserPage[]>;
  ping: (pageId?: string) => Promise<BrowserPingResult>;
  getMode: (pageId?: string) => Promise<LocatorMode>;
  setMode: (mode: LocatorMode, pageId?: string) => Promise<LocatorMode>;
  getSourceAtPoint: (
    input: {
      x: number;
      y: number;
      mode?: LocatorMode;
      pageId?: string;
    },
  ) => Promise<LocatorResult | null>;
  getSourceForSelector: (
    input: {
      selector: string;
      mode?: LocatorMode;
      pageId?: string;
    },
  ) => Promise<LocatorResult | null>;
  getSourceForActiveElement: (
    input: {
      mode?: LocatorMode;
      pageId?: string;
    },
  ) => Promise<LocatorResult | null>;
  openInEditor?: (source: string) => Promise<boolean>;
};

export type CreateLocatorMcpServerOptions = {
  bridge: LocatorBrowserBridge;
  serverName?: string;
  serverVersion?: string;
};

function parseSourceLocation(result: LocatorResult): SourceLocation {
  const match = /^(.*):(\d+):(\d+)$/.exec(result.source);
  if (!match) {
    throw new LocatorToolError("INVALID_ARGUMENT", `Invalid source format: ${result.source}`);
  }

  const [, file, line, column] = match;
  return {
    ...result,
    file,
    line: Number(line),
    column: Number(column),
  };
}

type StructuredToolResult = Record<string, unknown>;

function asText(value: StructuredToolResult) {
  return JSON.stringify(value, null, 2);
}

function toolResult<T extends StructuredToolResult>(data: T) {
  return {
    content: [{ type: "text" as const, text: asText(data) }],
    structuredContent: data,
  };
}

function getNotFoundMessage(target: string) {
  return `No source metadata found for ${target}.`;
}

export function createDisconnectedLocatorBrowserBridge(): LocatorBrowserBridge {
  return {
    async listPages() {
      return [];
    },
    async ping() {
      return {
        browserConnected: false,
        pageFound: false,
        runtimeAvailable: false,
        mode: "screen",
      };
    },
    async getMode() {
      throw new LocatorToolError("BROWSER_NOT_CONNECTED", "No browser bridge is connected.");
    },
    async setMode() {
      throw new LocatorToolError("BROWSER_NOT_CONNECTED", "No browser bridge is connected.");
    },
    async getSourceAtPoint() {
      throw new LocatorToolError("BROWSER_NOT_CONNECTED", "No browser bridge is connected.");
    },
    async getSourceForSelector() {
      throw new LocatorToolError("BROWSER_NOT_CONNECTED", "No browser bridge is connected.");
    },
    async getSourceForActiveElement() {
      throw new LocatorToolError("BROWSER_NOT_CONNECTED", "No browser bridge is connected.");
    },
    async openInEditor() {
      throw new LocatorToolError("BROWSER_NOT_CONNECTED", "No browser bridge is connected.");
    },
  };
}

export function createLocatorMcpServer(options: CreateLocatorMcpServerOptions) {
  const server = new McpServer({
    name: options.serverName ?? "react-code-locator",
    version: options.serverVersion ?? "0.1.15",
  });

  server.registerTool(
    "locator.ping",
    {
      title: "Locator Ping",
      description: "Check whether a browser page and the locator runtime are available.",
      inputSchema: { pageId: z.string().optional() },
    },
    async ({ pageId }) => toolResult(await options.bridge.ping(pageId)),
  );

  server.registerTool(
    "locator.list_pages",
    {
      title: "List Pages",
      description: "List pages available through the browser bridge.",
      inputSchema: {},
    },
    async () => toolResult({ pages: await options.bridge.listPages() }),
  );

  server.registerTool(
    "locator.get_mode",
    {
      title: "Get Mode",
      description: "Read the current locator mode for a page.",
      inputSchema: { pageId: z.string().optional() },
    },
    async ({ pageId }) => toolResult({ mode: await options.bridge.getMode(pageId) }),
  );

  server.registerTool(
    "locator.set_mode",
    {
      title: "Set Mode",
      description: "Set the current locator mode for a page.",
      inputSchema: {
        mode: locatorModeSchema,
        pageId: z.string().optional(),
      },
    },
    async ({ mode, pageId }) => toolResult({ mode: await options.bridge.setMode(mode, pageId) }),
  );

  server.registerTool(
    "locator.get_source_at_point",
    {
      title: "Get Source At Point",
      description: "Resolve source for the element rendered at viewport coordinates.",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        mode: locatorModeSchema.optional(),
        pageId: z.string().optional(),
      },
    },
    async ({ x, y, mode, pageId }) => {
      const result = await options.bridge.getSourceAtPoint({ x, y, mode, pageId });
      if (!result) {
        throw new LocatorToolError("SOURCE_NOT_FOUND", getNotFoundMessage(`point (${x}, ${y})`));
      }

      return toolResult({ location: parseSourceLocation(result) });
    },
  );

  server.registerTool(
    "locator.get_source_for_selector",
    {
      title: "Get Source For Selector",
      description: "Resolve source for the first element matching a CSS selector.",
      inputSchema: {
        selector: z.string().min(1),
        mode: locatorModeSchema.optional(),
        pageId: z.string().optional(),
      },
    },
    async ({ selector, mode, pageId }) => {
      const result = await options.bridge.getSourceForSelector({ selector, mode, pageId });
      if (!result) {
        throw new LocatorToolError("SOURCE_NOT_FOUND", getNotFoundMessage(`selector ${selector}`));
      }

      return toolResult({ location: parseSourceLocation(result) });
    },
  );

  server.registerTool(
    "locator.get_source_for_active_element",
    {
      title: "Get Source For Active Element",
      description: "Resolve source for the current active element.",
      inputSchema: {
        mode: locatorModeSchema.optional(),
        pageId: z.string().optional(),
      },
    },
    async ({ mode, pageId }) => {
      const result = await options.bridge.getSourceForActiveElement({ mode, pageId });
      if (!result) {
        throw new LocatorToolError("SOURCE_NOT_FOUND", getNotFoundMessage("the active element"));
      }

      return toolResult({ location: parseSourceLocation(result) });
    },
  );

  server.registerTool(
    "locator.open_in_editor",
    {
      title: "Open In Editor",
      description: "Open a resolved source location in the local editor.",
      inputSchema: {
        source: z.string().min(1),
      },
    },
    async ({ source }) => {
      if (!options.bridge.openInEditor) {
        throw new LocatorToolError(
          "INVALID_ARGUMENT",
          "This server instance does not provide an openInEditor bridge.",
        );
      }

      return toolResult({ opened: await options.bridge.openInEditor(source) });
    },
  );

  return server;
}

export async function runLocatorMcpServer(options: CreateLocatorMcpServerOptions) {
  const server = createLocatorMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
