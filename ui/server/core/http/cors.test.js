// The local-origin rule (#60): only an exact http://localhost:<port> / http://127.0.0.1:<port>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { corsOrigin } from "./cors.js";

test("corsOrigin: echoes an exact local http origin with a port", () => {
  assert.equal(corsOrigin("http://localhost:3117"), "http://localhost:3117");
  assert.equal(corsOrigin("http://127.0.0.1:4000"), "http://127.0.0.1:4000");
});

test("corsOrigin: rejects a look-alike host, IPv6, https, or a missing/default port", () => {
  for (const o of [
    "http://localhost.evil.com:80",
    "http://localhost.evil.com:3117",
    "http://[::1]:3117",
    "https://localhost:3117",
    "http://localhost",
    "http://localhost:80",
  ])
    assert.equal(corsOrigin(o), null, o);
});

test("corsOrigin: rejects anything that is not exactly the origin (path, credentials)", () => {
  for (const o of [
    "http://localhost:3117/",
    "http://localhost:3117@evil",
    "http://u:p@localhost:3117",
  ])
    assert.equal(corsOrigin(o), null, o);
});

test("corsOrigin: rejects absent and unparseable origins", () => {
  for (const o of [undefined, "", "null", "localhost:3117"]) assert.equal(corsOrigin(o), null);
});
