// Detection decides the ORDER of the domain picklist, so a wrong guess costs a keystroke, not
// a wrong install. What it must never do is claim an Expo project for the web pack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, order, summarize } from "./domain-pick.js";
import { render, choose, question } from "./picklist.js";

const ITEMS = [
  { id: "expoapp", summary: "Expo / React Native" },
  { id: "webapp", summary: "React + Node" },
];

test("expo in the manifest is decisive", () => {
  assert.equal(detect({ dependencies: { expo: "^52" } }, [])?.id, "expoapp");
  assert.equal(detect({ dependencies: { "react-native": "0.76" } }, [])?.id, "expoapp");
});

test("an Expo app is also a React app — react alone must not claim it for web", () => {
  const pkg = { dependencies: { expo: "^52", react: "19", "react-dom": "19" } };
  assert.equal(detect(pkg, [])?.id, "expoapp");
});

test("react or next without expo is the web pack", () => {
  assert.equal(detect({ dependencies: { next: "15", react: "19" } }, [])?.id, "webapp");
  assert.equal(detect({ devDependencies: { react: "19" } }, [])?.id, "webapp");
});

test("a bare Node server is the web pack", () => {
  assert.equal(detect({ dependencies: { express: "5" } }, [])?.id, "webapp");
});

test("app.json counts as Expo evidence when the manifest is silent", () => {
  const d = detect({}, ["app.json", "README.md"]);
  assert.equal(d?.id, "expoapp");
  assert.match(String(d?.why), /app\.json/);
});

test("nothing recognisable detects nothing rather than guessing", () => {
  assert.equal(detect({ dependencies: { lodash: "4" } }, ["README.md"]), null);
  assert.equal(detect({}, []), null);
});

test("the detected pack leads; without a detection the order is untouched", () => {
  assert.equal(order(ITEMS, { id: "webapp", why: "x" })[0]?.id, "webapp");
  assert.deepEqual(order(ITEMS, null), ITEMS);
  // An unknown detection must not drop options from the list.
  assert.equal(order(ITEMS, { id: "gone", why: "x" }).length, 2);
});

test("a descriptor paragraph becomes one line", () => {
  const long = { description: "First sentence here. Second one that should not appear." };
  assert.equal(summarize(long), "First sentence here.");
  assert.equal(summarize({ label: "Web App" }), "Web App");
  const huge = { description: `${"x".repeat(200)}.` };
  assert.ok(summarize(huge).length <= 120);
});

test("the picklist takes a number, an id, or empty for the recommended one", () => {
  assert.equal(choose("", ITEMS), "expoapp");
  assert.equal(choose("2", ITEMS), "webapp");
  assert.equal(choose("WEBAPP", ITEMS), "webapp");
  assert.equal(choose("3", ITEMS), null);
  assert.equal(choose("web", ITEMS), null, "a partial name is not a selection");
});

test("the question names what empty will pick", () => {
  assert.equal(question("Domain", ITEMS), "Domain [empty = expoapp]: ");
});

test("render lists every option and keeps the note", () => {
  const out = render({ title: "T", items: ITEMS, note: ["because reasons"] });
  assert.match(out, /1\) expoapp/);
  assert.match(out, /2\) webapp/);
  assert.match(out, /because reasons/);
});
