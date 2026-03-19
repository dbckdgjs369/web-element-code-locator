#!/usr/bin/env node

import {
  createDisconnectedLocatorBrowserBridge,
  runLocatorMcpServer,
} from "./mcp";

async function main() {
  await runLocatorMcpServer({
    bridge: createDisconnectedLocatorBrowserBridge(),
  });
}

main().catch((error: unknown) => {
  console.error("[react-code-locator:mcp]", error);
  process.exitCode = 1;
});
