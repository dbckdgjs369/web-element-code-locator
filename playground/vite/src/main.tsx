import { createRoot } from "react-dom/client";
import { locate } from "react-code-locator";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);

// Exposed for the e2e check. A real app would not need this — the injected client
// runtime wires up the mouse and keyboard handlers on its own.
(window as unknown as Record<string, unknown>).__rclLocate = locate;
