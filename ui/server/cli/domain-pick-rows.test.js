// domain-pick-rows.js — the one domain picklist row builder new.js and bootstrap.js share (#65).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { domainPickItems } from "./domain-pick-rows.js";

const OWN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("domainPickItems: this package's packs, the project's evident pack first", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xm-bt-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { expo: "1" } }));
  const { items, detected } = domainPickItems(OWN_ROOT, root, ["webapp", "expoapp"]);
  assert.deepEqual(detected, { id: "expoapp", why: "`expo` in package.json" });
  assert.deepEqual(
    items.map((i) => i.id),
    ["expoapp", "webapp"],
  );
  for (const i of items) assert.ok(i.summary.length > 0, `${i.id} has a summary`);
  const bare = domainPickItems(OWN_ROOT, path.join(root, "missing"), ["webapp", "expoapp"]);
  assert.equal(bare.detected, null);
  assert.deepEqual(
    bare.items.map((i) => i.id),
    ["webapp", "expoapp"],
  );
});

test("domainPickItems: a project path that cannot be listed reads as an empty project", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xm-bt-"));
  const file = path.join(root, "app.json");
  writeFileSync(file, "{}");
  const { items, detected } = domainPickItems(OWN_ROOT, file, ["webapp", "expoapp"]);
  assert.equal(detected, null);
  assert.deepEqual(
    items.map((i) => i.id),
    ["webapp", "expoapp"],
  );
});
