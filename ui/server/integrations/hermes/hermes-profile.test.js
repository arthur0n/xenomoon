// The Hermes half: how a profile is named and where its brain lives. Nothing here knows that
// installs exist — that is cli/hermes-identity.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { profileFor, freeGatewayPort, portFromUrl, hermesHome } from "./hermes-profile.js";

test("the profile carries the project, not just the domain", () => {
  // Two projects of one domain used to share a profile — one SOUL, one memory, one skills
  // set — so each poisoned the other's brain.
  assert.equal(profileFor("webapp", "/ws/alpha"), "webapp-alpha");
  assert.notEqual(profileFor("webapp", "/ws/alpha"), profileFor("webapp", "/ws/beta"));
});

test("project names are normalised into a safe directory name", () => {
  assert.equal(profileFor("webapp", "/ws/My App!"), "webapp-my-app");
  assert.equal(profileFor("webapp", "/ws/trailing/"), "webapp-trailing");
  // Nothing usable in the path — fall back to the domain rather than inventing a name.
  assert.equal(profileFor("webapp", "/"), "webapp");
});

test("the legacy shared home is never re-keyed", () => {
  // `default` is the upstream side's `~/.hermes`. Renaming it would move another product's brain.
  assert.equal(profileFor("default", "/ws/anything"), "default");
  assert.equal(hermesHome("default"), null);
});

test("each profile gets its own home directory", () => {
  assert.notEqual(hermesHome("webapp-a"), hermesHome("webapp-b"));
});

test("gateway ports step past the ones already taken", () => {
  assert.equal(freeGatewayPort("webapp", []), 8643);
  assert.equal(freeGatewayPort("webapp", [8643]), 8653);
  assert.equal(freeGatewayPort("webapp", [8643, 8653]), 8663);
  assert.equal(freeGatewayPort("unknown-domain", []), 8642);
});

test("a gateway url yields its port, and junk yields null", () => {
  assert.equal(portFromUrl("http://localhost:8643"), 8643);
  assert.equal(portFromUrl(null), null);
  assert.equal(portFromUrl("http://localhost"), null);
});
