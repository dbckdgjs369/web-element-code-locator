import { enableReactComponentJump } from "./runtime";
import type { LocatorOptions } from "./runtime";

export function enableElementLocator(options: LocatorOptions = {}) {
  return enableReactComponentJump(options);
}
