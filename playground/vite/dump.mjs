import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { reactCodeLocator } from "react-code-locator";
const server = await createServer({
  configFile: false, root: "/Users/yoochangheon/personal-project/react-code-locator-v2/playground/vite",
  logLevel: "error", server: { port: 5198 },
  plugins: [reactCodeLocator(), react()],
});
await server.listen();
const res = await fetch("http://localhost:5198/src/App.tsx");
const text = await res.text();
console.log(text.split("\n").map((l, i) => `${i + 1}| ${l}`).join("\n"));
await server.close();
