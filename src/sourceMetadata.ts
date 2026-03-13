export type SourceLocation = {
  line: number;
  column: number;
};

function normalizeSlashes(value: string) {
  return value.replace(/\\/g, "/");
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function splitPathSegments(value: string) {
  return normalizeSlashes(value).split("/").filter(Boolean);
}

function computeRelativePath(fromPath: string, toPath: string) {
  const fromSegments = splitPathSegments(fromPath);
  const toSegments = splitPathSegments(toPath);

  let sharedIndex = 0;
  while (
    sharedIndex < fromSegments.length &&
    sharedIndex < toSegments.length &&
    fromSegments[sharedIndex] === toSegments[sharedIndex]
  ) {
    sharedIndex += 1;
  }

  const upSegments = new Array(Math.max(0, fromSegments.length - sharedIndex)).fill("..");
  const downSegments = toSegments.slice(sharedIndex);
  const relativeSegments = [...upSegments, ...downSegments];
  return relativeSegments.length > 0 ? relativeSegments.join("/") : ".";
}

export function normalizeProjectRoot(projectRoot?: string) {
  if (projectRoot) {
    return trimTrailingSlash(normalizeSlashes(projectRoot));
  }

  if (typeof process !== "undefined" && typeof process.cwd === "function") {
    return trimTrailingSlash(normalizeSlashes(process.cwd()));
  }

  return "";
}

export function toRelativeSource(
  filename: string | undefined,
  loc: SourceLocation | null | undefined,
  projectRoot?: string,
) {
  if (!filename || !loc) {
    return null;
  }

  const root = normalizeProjectRoot(projectRoot);
  const normalizedFilename = normalizeSlashes(filename);
  const relPath =
    root && normalizedFilename.startsWith(`${root}/`)
      ? normalizedFilename.slice(root.length + 1)
      : root
        ? computeRelativePath(root, normalizedFilename)
        : normalizedFilename;
  return `${relPath}:${loc.line}:${loc.column + 1}`;
}

export function getSourceFile(source: string | null) {
  if (!source) {
    return null;
  }

  const match = source.match(/^(.*):\d+:\d+$/);
  return match?.[1] ?? null;
}

export function isProjectLocalFile(filename: string | undefined, projectRoot?: string) {
  if (!filename) {
    return false;
  }

  const root = normalizeProjectRoot(projectRoot);
  const normalizedFilename = normalizeSlashes(filename);

  if (!root) {
    return (
      !normalizedFilename.startsWith("../") &&
      !normalizedFilename.startsWith("/") &&
      !/^[A-Za-z]:\//.test(normalizedFilename)
    );
  }

  if (normalizedFilename.startsWith(`${root}/`) || normalizedFilename === root) {
    return true;
  }

  const relativePath = computeRelativePath(root, normalizedFilename);
  return !relativePath.startsWith("../");
}

export function isExternalToProjectRoot(filename: string | undefined, projectRoot?: string) {
  return !isProjectLocalFile(filename, projectRoot);
}

export function isProjectLocalSource(source: string, projectRoot?: string) {
  const file = getSourceFile(source);
  return isProjectLocalFile(file ?? undefined, projectRoot);
}
