/**
 * Webpack Plugin for react-code-locator
 * CJS-compatible re-export from unplugin
 */

import { unplugin } from "./unplugin";

// Re-export webpack plugin from unplugin
export const webpackPlugin = unplugin.webpack;
export default unplugin.webpack;
