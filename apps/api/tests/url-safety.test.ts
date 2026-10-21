import test from "node:test";
import assert from "node:assert/strict";
import type { lookup } from "node:dns/promises";
import { validatePublicUrl } from "../src/url-safety.js";

const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof lookup;

test("normalizes a public HTTP URL and removes its fragment", async () => {
  const value = await validatePublicUrl("https://example.com/path#section", publicDns);
  assert.equal(value, "https://example.com/path");
});

test("rejects unsupported schemes, credentials, and nonstandard ports", async () => {
  await assert.rejects(validatePublicUrl("file:///etc/passwd"), /Only HTTP and HTTPS/);
  await assert.rejects(validatePublicUrl("https://user:secret@example.com"), /usernames or passwords/);
  await assert.rejects(validatePublicUrl("https://example.com:8443"), /standard HTTP\/HTTPS ports/);
});

test("blocks loopback, private IPs, and metadata hostnames without resolving them", async () => {
  await assert.rejects(validatePublicUrl("http://localhost"), /host is not allowed/);
  await assert.rejects(validatePublicUrl("http://127.0.0.1"), /Private or reserved/);
  await assert.rejects(validatePublicUrl("http://169.254.169.254"), /Private or reserved/);
  await assert.rejects(validatePublicUrl("http://metadata.google.internal"), /host is not allowed/);
});

test("rejects hostnames with any private DNS answer", async () => {
  const mixedDns = (async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.8", family: 4 }
  ]) as typeof lookup;
  await assert.rejects(validatePublicUrl("https://mixed.example", mixedDns), /private or reserved/);
});
