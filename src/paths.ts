/**
 * Path helpers shared by the hooks and the browser runtime.
 *
 * Everything is normalized to forward slashes and to a `file:line:column` string, which
 * is the one shape the editor endpoint and the UI both understand.
 */

import type { SourceLocation } from "./registry";

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function normalizeProjectRoot(projectRoot?: string): string {
  return projectRoot ? normalizeSlashes(projectRoot).replace(/\/+$/, "") : "";
}

/**
 * Turbopack reports positions against a virtual root: `[project]/app/page.tsx`. Left
 * alone, that string is useless to an editor and useless to paste anywhere — and it is
 * already project-relative once the marker is gone, so there is nothing else to do.
 */
export function stripVirtualRoot(file: string): string {
  return normalizeSlashes(file).replace(/^\[project\]\/+/, "");
}

/** Absolute -> project-relative, plus the Turbopack marker. Idempotent. */
export function toProjectRelative(file: string, projectRoot?: string): string {
  const root = normalizeProjectRoot(projectRoot);
  const normalized = stripVirtualRoot(file);
  return root && normalized.startsWith(`${root}/`)
    ? normalized.slice(root.length + 1)
    : normalized;
}

export function formatLocation(loc: SourceLocation, projectRoot?: string): string {
  return `${toProjectRelative(loc.file, projectRoot)}:${loc.line}:${loc.column}`;
}

const SOURCE_RE = /^(.*):(\d+):(\d+)$/;

export function getSourceFile(source: string | null | undefined): string | null {
  if (!source) return null;
  return source.match(SOURCE_RE)?.[1] ?? null;
}

/**
 * Distinguishes "code the user wrote" from "code that came out of node_modules".
 *
 * This is what makes the two locate modes meaningful: clicking a design-system button
 * should offer both the place it was *used* (project-local) and the place it was
 * *implemented* (a dependency), and the runtime needs to tell those apart.
 */
export function isProjectLocalFile(file: string | undefined | null): boolean {
  if (!file) return false;
  const normalized = normalizeSlashes(file);
  if (normalized.includes("/node_modules/")) return false;
  // Paths are project-relative wherever a projectRoot was supplied, so node_modules can
  // also be the very first segment.
  if (normalized.startsWith("node_modules/")) return false;
  // Vite serves dependencies from these; they are never user source.
  if (normalized.includes("/.vite/deps/")) return false;
  if (normalized.startsWith("/@fs/") && normalized.includes("/node_modules/")) return false;
  return !normalized.startsWith("../");
}

export function isProjectLocalSource(source: string): boolean {
  return isProjectLocalFile(getSourceFile(source));
}
