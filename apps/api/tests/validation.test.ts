import test from "node:test";
import assert from "node:assert/strict";
import { createScanSchema, scanHistoryQuerySchema, scanIdSchema } from "../src/schemas/scan.js";

test("scan input accepts a valid URL and trims whitespace", () => {
  assert.equal(createScanSchema.parse({ url: " https://example.com " }).url, "https://example.com");
});

test("scan input rejects malformed and missing URLs", () => {
  assert.equal(createScanSchema.safeParse({ url: "not a url" }).success, false);
  assert.equal(createScanSchema.safeParse({}).success, false);
});

test("scan IDs and history pagination are bounded", () => {
  assert.equal(scanIdSchema.safeParse({ id: "" }).success, false);
  assert.deepEqual(scanHistoryQuerySchema.parse({ page: "2", limit: "10" }), { page: 2, limit: 10 });
  assert.equal(scanHistoryQuerySchema.safeParse({ limit: 500 }).success, false);
});
