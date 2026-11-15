import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  installedDomain,
  domainRefusal,
  entryForDir,
  nameRefusal,
  portRefusal,
  portsClaimedByOthers,
  addProjectEntry,
} from "./project-entry.js";
import { canonicalPath } from "./validate-path.js";
import { parseJSON } from "../../lib/json.js";

const INSTALL = "/installs/web";
const projects = { shop: { dir: "/work/shop", port: 3117 }, blog: { dir: "../blog", port: 3118 } };

test("installedDomain: baked descriptor + domain name = installed; either alone = fresh", () => {
  assert.equal(
    installedDomain({ domain: "webapp", domainDescriptor: { name: "webapp" } }),
    "webapp",
  );
  assert.equal(installedDomain({ domainDescriptor: { name: "webapp" } }), null);
  assert.equal(installedDomain({ domain: "webapp" }), null);
  assert.equal(installedDomain({}), null);
});

test("domainRefusal: omitted or same domain passes; another domain names the installed one", () => {
  assert.equal(domainRefusal("webapp", null), null);
  assert.equal(domainRefusal("webapp", "webapp"), null);
  const why = domainRefusal("webapp", "expoapp");
  assert.match(why ?? "", /"webapp" domain installed/);
  assert.match(why ?? "", /"expoapp" domain's own install/);
});

test("entryForDir: finds the entry by resolved dir, relative dirs against the install", () => {
  assert.deepEqual(entryForDir(projects, "/work/shop/", INSTALL), {
    name: "shop",
    entry: projects.shop,
  });
  assert.equal(entryForDir(projects, "/installs/blog", INSTALL)?.name, "blog");
  assert.equal(entryForDir(projects, "/work/other", INSTALL), null);
});

test("nameRefusal: a name used by a DIFFERENT folder is refused, naming that folder", () => {
  const why = nameRefusal(projects, "shop", "/work/other", INSTALL);
  assert.match(why ?? "", /"shop" is already used by \/work\/shop/);
  assert.equal(nameRefusal(projects, "shop", "/work/shop", INSTALL), null);
  assert.equal(nameRefusal(projects, "fresh", "/work/other", INSTALL), null);
  assert.ok(nameRefusal(projects, "", "/work/other", INSTALL));
});

test("portRefusal: a claimed port is refused with its number; a free one passes", () => {
  assert.match(portRefusal(3117, [3117, 3118]) ?? "", /port 3117 is already claimed/);
  assert.equal(portRefusal(3119, [3117, 3118]), null);
  assert.ok(portRefusal(0, []));
});

test("portRefusal: the root project of a pre-map install may keep its own root port", () => {
  assert.equal(portRefusal(3117, [3117], 3117), null);
  assert.ok(portRefusal(3117, [3117], 4000));
});

// ---- #65 review fixes: one port rule, real-location identity, commit-time ownership ----------

/** A temp dir spelled the way tmpdir() gives it (on macOS /var/..., an alias of /private/var).
 * @returns {string} */
const tmp = () => mkdtempSync(path.join(tmpdir(), "xeno-entry-"));

/** An install dir holding `cfg` as its .xenomoon.json. @param {Record<string, unknown>} cfg */
function install(cfg) {
  const dir = tmp();
  writeFileSync(path.join(dir, ".xenomoon.json"), JSON.stringify(cfg, null, 2) + "\n");
  return dir;
}

test("portRefusal: a port that is not a positive integer is refused, naming it", () => {
  for (const bad of [0, -1, 3.5, NaN])
    assert.match(portRefusal(bad, []) ?? "", /port must be an integer from 1 to 65535 \(got/);
});

test("#65: portRefusal: 65536 and 0 are refused naming the range; 65535 and 1 pass", () => {
  assert.equal(portRefusal(65536, []), "port must be an integer from 1 to 65535 (got 65536).");
  assert.equal(portRefusal(0, []), "port must be an integer from 1 to 65535 (got 0).");
  assert.equal(portRefusal(65535, []), null);
  assert.equal(portRefusal(1, []), null);
});

test("#65: addProjectEntry: a port above 65535 writes nothing; 65535 writes", () => {
  const dir = install({ projects: {} });
  const before = readFileSync(path.join(dir, ".xenomoon.json"), "utf8");
  const why = addProjectEntry(dir, "big", { dir: "/w/big", port: 65536 }, { registry: {} });
  assert.match(why ?? "", /from 1 to 65535 \(got 65536\)\. Nothing was written\./);
  assert.equal(readFileSync(path.join(dir, ".xenomoon.json"), "utf8"), before);
  assert.equal(addProjectEntry(dir, "top", { dir: "/w/top", port: 65535 }, { registry: {} }), null);
  const cfg = /** @type {{ projects: Record<string, { port: number }> }} */ (
    parseJSON(readFileSync(path.join(dir, ".xenomoon.json"), "utf8"))
  );
  assert.equal(cfg.projects.top?.port, 65535);
});

/** A real temp dir and the same dir spelled with its case flipped, or null when the temp
 * filesystem is case-sensitive (the flipped spelling does not exist there). */
function caseVariant() {
  const real = realpathSync(mkdtempSync(path.join(tmpdir(), "Xeno-Case-")));
  const flipped = path.join(path.dirname(real), path.basename(real).toLowerCase());
  return existsSync(flipped) ? { real, flipped } : null;
}
const caseSensitive = caseVariant() === null;
const skipCase = caseSensitive && "the temp filesystem is case-sensitive: no case variant exists";

test(
  "#65: entryForDir: the same folder spelled with other letter case matches its entry",
  {
    skip: skipCase,
  },
  () => {
    const v = /** @type {{ real: string, flipped: string }} */ (caseVariant());
    const projects = { shop: { dir: v.real, port: 4500 } };
    assert.equal(entryForDir(projects, v.flipped, "/unused")?.name, "shop");
    // Two entries already in a map that differ only by case name one folder: both match it.
    assert.equal(entryForDir({ old: { dir: v.flipped } }, v.real, "/unused")?.name, "old");
    assert.equal(canonicalPath(v.flipped), v.real);
    assert.equal(
      canonicalPath(path.join(v.flipped, "Not", "Yet")),
      path.join(v.real, "Not", "Yet"),
    );
  },
);

test("portsClaimedByOthers: a first run sees another install's project port as claimed", () => {
  const other = install({ port: 4000, projects: { x: { dir: "/elsewhere/x", port: 4100 } } });
  const self = tmp();
  const claimed = portsClaimedByOthers(
    self,
    {},
    {
      ownName: "app",
      includeRoot: false,
      registry: { [other]: null, [self]: null },
    },
  );
  assert.match(portRefusal(4100, claimed) ?? "", /port 4100 is already claimed/);
  assert.match(portRefusal(4000, claimed) ?? "", /port 4000 is already claimed/);
  // A first run's own install root (absent = the default) is the port this project takes.
  assert.equal(portRefusal(3117, claimed), null);
});

test("portsClaimedByOthers: a re-run may keep its own entry's port; another entry's is claimed", () => {
  const cfg = {
    port: 3117,
    projects: { shop: { dir: "/w/shop", port: 3117 }, blog: { dir: "/w/blog", port: 3118 } },
  };
  const self = tmp();
  const claimed = portsClaimedByOthers(self, cfg, {
    ownName: "blog",
    includeRoot: true,
    registry: {},
  });
  assert.equal(portRefusal(3118, claimed), null);
  assert.ok(portRefusal(3117, claimed));
});

test("entryForDir: the same folder through an alias (symlink, trailing slash) matches its entry", () => {
  const real = realpathSync(tmp());
  const link = path.join(tmp(), "alias");
  symlinkSync(real, link);
  const projects = { app: { dir: real, port: 4200 } };
  assert.equal(entryForDir(projects, link, "/unused")?.name, "app");
  assert.equal(entryForDir(projects, link + "/", "/unused")?.name, "app");
  assert.equal(nameRefusal(projects, "app", link, "/unused"), null);
});

test("canonicalPath: a missing path is its nearest existing ancestor's real path + the rest", () => {
  const base = tmp();
  const link = path.join(tmp(), "alias");
  symlinkSync(base, link);
  assert.equal(
    canonicalPath(path.join(link, "not", "yet")),
    path.join(realpathSync(base), "not", "yet"),
  );
  assert.equal(canonicalPath("rel", link), path.join(realpathSync(base), "rel"));
});

test("entryForDir: a legacy entry stored through an alias still matches its folder", () => {
  const real = realpathSync(tmp());
  const link = path.join(tmp(), "alias");
  symlinkSync(real, link);
  // Written before dirs were stored canonical: the alias text, not the real path.
  assert.equal(entryForDir({ old: { dir: link } }, real, "/unused")?.name, "old");
});

test("addProjectEntry: a name another run gave another folder meanwhile writes nothing", () => {
  const dir = install({ port: 3117, projects: { app: { dir: "/w/other", port: 4300 } } });
  const before = readFileSync(path.join(dir, ".xenomoon.json"));
  const why = addProjectEntry(dir, "app", { dir: "/w/mine", port: 4301 }, { registry: {} });
  assert.match(why ?? "", /another run gave the project name "app" to another folder/);
  assert.match(why ?? "", /nothing was written; run the command again/);
  assert.ok(readFileSync(path.join(dir, ".xenomoon.json")).equals(before));
});

test("addProjectEntry: a port another run took meanwhile writes nothing; a free one writes", () => {
  const dir = install({ port: 3117, projects: { racer: { dir: "/w/racer", port: 4400 } } });
  const file = path.join(dir, ".xenomoon.json");
  const before = readFileSync(file);
  const why = addProjectEntry(dir, "mine", { dir: "/w/mine", port: 4400 }, { registry: {} });
  assert.match(why ?? "", /another run took port 4400 meanwhile/);
  assert.ok(readFileSync(file).equals(before));
  assert.equal(
    addProjectEntry(dir, "mine", { dir: "/w/mine", port: 4401 }, { registry: {} }),
    null,
  );
  const after = /** @type {{ projects: Record<string, unknown> }} */ (
    parseJSON(readFileSync(file, "utf8"))
  );
  assert.deepEqual(after.projects.mine, {
    dir: "/w/mine",
    port: 4401,
  });
});

test("#65: addProjectEntry writes nothing while another install's project list is invalid", () => {
  const broken = install({
    port: 4000,
    projects: { a: { dir: "/a", port: 3118 }, b: { port: 1 } },
  });
  const dir = install({ port: 4500 });
  const file = path.join(dir, ".xenomoon.json");
  const before = readFileSync(file);
  const why = addProjectEntry(
    dir,
    "mine",
    { dir: "/w/mine", port: 4501 },
    {
      registry: { [broken]: null },
    },
  );
  assert.match(why ?? "", /cannot pick a port/);
  assert.ok((why ?? "").includes(path.join(broken, ".xenomoon.json")), why ?? "");
  assert.ok(readFileSync(file).equals(before));
});
