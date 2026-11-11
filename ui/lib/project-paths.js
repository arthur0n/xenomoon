// Project-side paths the framework writes inside the bound project. This module is
// the one place each such path is joined, so server code and later readers (token
// history) agree on it without repeating the segments.
import path from "node:path";

/**
 * The project's log dir: `<project>/.xenomoon/logs`. Joined, never resolved.
 * @param {string} projectDir
 * @returns {string}
 */
export function projectLogDir(projectDir) {
  return path.join(projectDir, ".xenomoon", "logs");
}
