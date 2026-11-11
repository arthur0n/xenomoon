// projectLogDir (#62): the project-side log dir path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectLogDir } from "./project-paths.js";

test("projectLogDir puts logs under <project>/.xenomoon/logs", () => {
  assert.equal(projectLogDir("/a/b"), "/a/b/.xenomoon/logs");
});

test("projectLogDir joins a relative input without resolving it", () => {
  assert.equal(projectLogDir("a/b"), "a/b/.xenomoon/logs");
});
