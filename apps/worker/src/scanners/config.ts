const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const MAX_NAVIGATION_TIMEOUT_MS = 60_000;

export function navigationTimeoutMs(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return DEFAULT_NAVIGATION_TIMEOUT_MS;
  return Math.min(MAX_NAVIGATION_TIMEOUT_MS, Math.max(100, Number(value)));
}
