const path = require("node:path");
const { withReactCodeLocator } = require("react-code-locator/next");

module.exports = withReactCodeLocator({
  // Several lockfiles exist above this directory; pin the root so Turbopack stops guessing.
  turbopack: { root: __dirname },
});
