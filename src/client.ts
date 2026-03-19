export { enableReactComponentJump, locateComponentSource } from "./runtime";
export type { LocatorMode, LocatorOptions, LocatorResult, TriggerKey } from "./runtime";
import { installLocatorMcpBridge } from "./mcpBrowser";
export {
  LOCATOR_MCP_BRIDGE_GLOBAL,
  createLocatorMcpBridge,
  installLocatorMcpBridge,
} from "./mcpBrowser";
export type { LocatorMcpBridge } from "./mcpBrowser";

installLocatorMcpBridge();
