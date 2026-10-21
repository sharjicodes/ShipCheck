import { ScanStatus } from "@shipcheck/db";

const transitions: Record<ScanStatus, ReadonlySet<ScanStatus>> = {
  [ScanStatus.QUEUED]: new Set([ScanStatus.QUEUED, ScanStatus.RUNNING, ScanStatus.FAILED]),
  [ScanStatus.RUNNING]: new Set([ScanStatus.RUNNING, ScanStatus.COMPLETED, ScanStatus.FAILED]),
  [ScanStatus.COMPLETED]: new Set([ScanStatus.COMPLETED]),
  [ScanStatus.FAILED]: new Set([ScanStatus.FAILED])
};

export function assertScanStatusTransition(from: ScanStatus, to: ScanStatus): void {
  if (!transitions[from].has(to)) {
    throw new Error(`Invalid scan status transition: ${from.toLowerCase()} → ${to.toLowerCase()}.`);
  }
}
