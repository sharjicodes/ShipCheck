import test from "node:test";
import assert from "node:assert/strict";
import { ScanStatus } from "@shipcheck/db";
import { assertScanStatusTransition } from "../src/scan-status.js";

test("allows queued to running to completed and retry in running state", () => {
  assert.doesNotThrow(() => assertScanStatusTransition(ScanStatus.QUEUED, ScanStatus.RUNNING));
  assert.doesNotThrow(() => assertScanStatusTransition(ScanStatus.RUNNING, ScanStatus.RUNNING));
  assert.doesNotThrow(() => assertScanStatusTransition(ScanStatus.RUNNING, ScanStatus.COMPLETED));
});

test("allows failure but prevents reopening terminal scans", () => {
  assert.doesNotThrow(() => assertScanStatusTransition(ScanStatus.RUNNING, ScanStatus.FAILED));
  assert.throws(() => assertScanStatusTransition(ScanStatus.COMPLETED, ScanStatus.RUNNING), /Invalid scan status transition/);
  assert.throws(() => assertScanStatusTransition(ScanStatus.FAILED, ScanStatus.COMPLETED), /Invalid scan status transition/);
});
