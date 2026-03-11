import { defineConfig } from "vite";
import { elementLocatorReact } from "./src/index";

export default defineConfig(({ command }) => ({
  plugins: elementLocatorReact({
    command,
    locator: {
      triggerKey: "shift",
    },
  }),
}));
