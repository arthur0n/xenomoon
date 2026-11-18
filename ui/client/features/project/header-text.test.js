// Header text helpers (#95): path shortening and the browser tab title.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homePath, chipPath, pageTitle } from "./header-text.js";

void test("homePath replaces the home folder with ~ and keeps the rest", () => {
  assert.equal(homePath("/Users/me/work/alpha"), "~/work/alpha");
  assert.equal(homePath("/srv/alpha"), "/srv/alpha");
});

void test("chipPath fences the home-relative path with left-to-right marks", () => {
  assert.equal(chipPath("/Users/me/work/alpha"), "\u200E~/work/alpha\u200E");
});

void test("pageTitle names the project once state is loaded, else the bare brand", () => {
  assert.equal(pageTitle({ name: "alpha", found: true }), "alpha · Xenomoon Forge");
  assert.equal(pageTitle({ name: "alpha", found: false }), "Xenomoon Forge");
  assert.equal(pageTitle(null), "Xenomoon Forge");
});
