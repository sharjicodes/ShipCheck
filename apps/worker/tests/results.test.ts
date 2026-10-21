import test from "node:test";
import assert from "node:assert/strict";
import type axe from "axe-core";
import { normalizeAxeResults, publicScanFailure } from "../src/scanners/results.js";
import { navigationTimeoutMs } from "../src/scanners/config.js";

test("normalizes axe findings and a summary without claiming a score", () => {
  const results = {
    violations: [{
      id: "image-alt", impact: "critical", description: "Images need text alternatives", help: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/image-alt", tags: ["wcag2a", "wcag111"],
      nodes: [{ target: ["img.hero"], html: "<img class=\"hero\">", failureSummary: "Fix the image alt text." }]
    }],
    passes: [{}, {}], incomplete: [{}], inapplicable: []
  } as unknown as axe.AxeResults;

  const output = normalizeAxeResults(results, "Fixture page", 200);
  assert.equal(output.summary.violations, 1);
  assert.equal(output.summary.passes, 2);
  assert.equal(output.summary.incomplete, 1);
  assert.equal(output.summary.affectedNodes, 1);
  assert.match(output.findings[0].examples[0], /Fix the image alt text/);
  assert.equal(output.findings[0].tags.includes("wcag111"), true);
});

test("provides understandable failure messages for timeouts and blocked redirects", () => {
  assert.match(publicScanFailure(new Error("Navigation timeout of 20000ms exceeded")), /too long to respond/);
  assert.match(publicScanFailure(new Error("Website redirected to a different host")), /another host/);
  assert.match(publicScanFailure(new Error("connection reset")), /could not complete/);
});

test("bounds the configurable navigation timeout", () => {
  assert.equal(navigationTimeoutMs(undefined), 20_000);
  assert.equal(navigationTimeoutMs("not-a-number"), 20_000);
  assert.equal(navigationTimeoutMs("1"), 100);
  assert.equal(navigationTimeoutMs("90000"), 60_000);
});
