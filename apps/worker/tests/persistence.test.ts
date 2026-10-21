import test from "node:test";
import assert from "node:assert/strict";
import { prisma, ScanStatus } from "@shipcheck/db";

test("stores a completed scan summary and accessibility findings in PostgreSQL", async () => {
  const scan = await prisma.scan.create({
    data: { url: "https://example.com/fixture", hostname: "example.com", status: ScanStatus.QUEUED }
  });
  try {
    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: ScanStatus.RUNNING, startedAt: new Date() }
    });
    const savedFinding = { id: "image-alt", impact: "serious", nodes: 1, tags: ["wcag2a"] };
    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: ScanStatus.COMPLETED,
        completedAt: new Date(),
        durationMs: 123,
        summary: { violations: 1, passes: 4, incomplete: 0, affectedNodes: 1 },
        findings: [savedFinding]
      }
    });
    const persisted = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } });
    assert.equal(persisted.status, ScanStatus.COMPLETED);
    assert.deepEqual(persisted.summary, { violations: 1, passes: 4, incomplete: 0, affectedNodes: 1 });
    assert.deepEqual(persisted.findings, [savedFinding]);
    assert.equal(persisted.durationMs, 123);
  } finally {
    await prisma.scan.delete({ where: { id: scan.id } });
  }
});
