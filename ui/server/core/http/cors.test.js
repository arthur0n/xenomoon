// The local-origin rule (#60): only an exact http://localhost:<port> / http://127.0.0.1:<port>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { corsOrigin, isLocalHost, requestRefusal } from "./cors.js";

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

test("isLocalHost: accepts exactly localhost / 127.0.0.1, with or without a port", () => {
  for (const h of [
    "localhost:3117",
    "127.0.0.1:4000",
    "localhost",
    "localhost:80",
    "127.0.0.1",
    "127.0.0.1:80",
  ])
    assert.equal(isLocalHost(h), true, h);
});

test("isLocalHost: rejects foreign, look-alike, IPv6, upper case, userinfo, path, absent", () => {
  for (const h of [
    undefined,
    "",
    "evil.example:3117",
    "localhost.evil.example:3117",
    "127.0.0.1.evil.example:3117",
    "[::1]:3117",
    "LOCALHOST",
    "LOCALHOST:3117",
    "localhost:080",
    "localhost:",
    "u@localhost:3117",
    "localhost:3117@evil",
    "localhost:3117/x",
    "127.1:3117",
  ])
    assert.equal(isLocalHost(h), false, String(h));
});

test("#89 requestRefusal: the own origin, or no Origin, on a local Host is accepted", () => {
  for (const host of ["127.0.0.1:3117", "localhost:3117"]) {
    assert.equal(requestRefusal({ host, origin: `http://${host}` }), null, `own ${host}`);
    assert.equal(requestRefusal({ host }), null, `none ${host}`);
  }
});

test("#89 requestRefusal: an Origin that is not exactly http://<Host> is 'forbidden origin'", () => {
  const host = "127.0.0.1:3117";
  for (const origin of [
    "http://127.0.0.1:3118",
    "http://evil.example:3117",
    "http://localhost:3117",
    "null",
    "",
    `http://${host}/`,
    `https://${host}`,
  ])
    assert.equal(requestRefusal({ host, origin }), "forbidden origin", JSON.stringify(origin));
});

test("#89 requestRefusal: a foreign or absent Host is 'forbidden host', even with a matching Origin", () => {
  assert.equal(requestRefusal({ host: "evil.example:3117" }), "forbidden host");
  assert.equal(
    requestRefusal({ host: "evil.example:3117", origin: "http://evil.example:3117" }),
    "forbidden host",
  );
  assert.equal(requestRefusal({}), "forbidden host");
});
