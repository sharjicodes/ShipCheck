import test from "node:test";
import assert from "node:assert/strict";
import type { lookup } from "node:dns/promises";
import { isAllowedBrowserRequest } from "../src/security/request-policy.js";

const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof lookup;
const privateDns = (async () => [{ address: "10.0.0.12", family: 4 }]) as typeof lookup;

test("allows same-host public requests and blocks cross-host redirects", async () => {
  assert.equal(await isAllowedBrowserRequest("https://example.com/assets/app.js", "https://example.com", publicDns), true);
  assert.equal(await isAllowedBrowserRequest("https://attacker.example/", "https://example.com", publicDns), false);
});

test("blocks unsupported protocols, nonstandard ports, and private DNS results", async () => {
  assert.equal(await isAllowedBrowserRequest("file:///etc/passwd", "https://example.com", publicDns), false);
  assert.equal(await isAllowedBrowserRequest("https://example.com:8443/", "https://example.com", publicDns), false);
  assert.equal(await isAllowedBrowserRequest("https://example.com/", "https://example.com", privateDns), false);
});
