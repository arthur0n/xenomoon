// The install half: what OTHER installs already hold, and what this one therefore gets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { otherGatewayPorts, resolveInstallIdentity } from "./hermes-identity.js";

const INSTALLS = { "/ws/alpha-xm": "/ws/alpha", "/ws/beta-xm": "/ws/beta" };
/** @param {string} d @returns {string | null} */
const url = (d) => (d === "/ws/alpha-xm" ? "http://localhost:8643" : "http://localhost:8653");

test("only OTHER installs' ports count", () => {
  assert.deepEqual(otherGatewayPorts("/ws/alpha-xm", INSTALLS, url), [8653]);
  assert.deepEqual(otherGatewayPorts("/ws/gamma-xm", INSTALLS, url), [8643, 8653]);
});

test("an install that never configured Hermes claims no port", () => {
  assert.deepEqual(
    otherGatewayPorts("/ws/self", { "/ws/alpha-xm": "/ws/alpha" }, () => null),
    [],
  );
});

test("what an install already saved wins — nothing is moved underneath it", () => {
  const id = resolveInstallIdentity({
    saved: { profile: "webapp", apiUrl: "http://localhost:8643" },
    domain: "webapp",
    projectDir: "/ws/alpha",
    frameworkDir: "/ws/alpha-xm",
    installs: {},
  });
  assert.deepEqual(id, { profile: "webapp", port: "8643" });
});

test("a fresh install derives both, stepping past what another install holds", () => {
  const id = resolveInstallIdentity({
    saved: {},
    domain: "webapp",
    projectDir: "/ws/alpha",
    frameworkDir: "/ws/alpha-xm",
    installs: { "/ws/beta-xm": "/ws/beta" },
    // beta-xm has no saved url here, so it claims nothing and the floor stays free.
  });
  assert.equal(id.profile, "webapp-alpha");
  assert.equal(id.port, "8643");
});

test("explicit flags beat everything", () => {
  const id = resolveInstallIdentity({
    flagProfile: "chosen",
    flagPort: "9999",
    saved: { profile: "webapp", apiUrl: "http://localhost:8643" },
    domain: "webapp",
    projectDir: "/ws/alpha",
    frameworkDir: "/ws/alpha-xm",
    installs: {},
  });
  assert.deepEqual(id, { profile: "chosen", port: "9999" });
});
