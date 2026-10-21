import { Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { chromium } from "playwright";
import axe from "axe-core";
import { ScanStatus } from "@shipcheck/db";
import { prisma } from "@shipcheck/db";
import { assertScanStatusTransition } from "../../api/src/scan-status.js";
import { normalizeAxeResults, publicScanFailure } from "./scanners/results.js";
import { isAllowedBrowserRequest } from "./security/request-policy.js";
import { navigationTimeoutMs } from "./scanners/config.js";

type ScanJob = { scanId: string; url: string };
const NAVIGATION_TIMEOUT_MS = navigationTimeoutMs(process.env.SCAN_NAVIGATION_TIMEOUT_MS);

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

const worker = new Worker<ScanJob>("website-scans", async (job: Job<ScanJob>) => {
  const { scanId, url } = job.data;
  const startedAt = new Date();
  const current = await prisma.scan.findUnique({ where: { id: scanId }, select: { status: true } });
  if (!current) throw new Error("Scan record was not found.");
  assertScanStatusTransition(current.status, ScanStatus.RUNNING);
  await prisma.scan.update({ where: { id: scanId }, data: { status: ScanStatus.RUNNING, startedAt, error: null } });

  // Browser is launched with no host mounts or secrets. Production deployment
  // must also enforce restrictive outbound network egress at infrastructure level.
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
      ignoreHTTPSErrors: false
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(10_000);

    // Limit navigation/subresources to the submitted origin for the MVP.
    // This is defense-in-depth, not a substitute for network-level egress controls.
    let crossHostRedirectBlocked = false;
    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      // Re-resolve every browser request as defense in depth. Egress filtering
      // at the worker network remains necessary to defeat DNS rebinding races.
      if (!await isAllowedBrowserRequest(requestUrl, url)) {
        const redirectedFrom = route.request().redirectedFrom();
        if (redirectedFrom && new URL(requestUrl).hostname !== new URL(url).hostname) crossHostRedirectBlocked = true;
        return await route.abort();
      }
      return await route.continue();
    });

    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    } catch (error) {
      if (crossHostRedirectBlocked) throw new Error("Website redirected to a different host, which is not allowed.");
      throw error;
    }
    if (!response) throw new Error("The website did not return a document response.");
    if (!await isAllowedBrowserRequest(response.url(), url)) throw new Error("The website redirected to a different host, which is not allowed.");
    if (response.status() >= 400) throw new Error(`Website returned HTTP ${response.status()}.`);

    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async (): Promise<axe.AxeResults> => {
      // axe is added to the page immediately before this evaluation.
      const axeInPage = (window as unknown as { axe: typeof axe }).axe;
      return await axeInPage.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }
      });
    });
    const typedResults = results;
    const normalized = normalizeAxeResults(typedResults, await page.title(), response.status());
    assertScanStatusTransition(ScanStatus.RUNNING, ScanStatus.COMPLETED);

    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: ScanStatus.COMPLETED,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        summary: normalized.summary,
        findings: normalized.findings
      }
    });
  } finally {
    await browser.close();
  }
}, {
  connection,
  concurrency: 2,
  limiter: { max: 10, duration: 60_000 }
});

worker.on("failed", async (job, error) => {
  if (!job) return;
  console.error(`Scan job ${job.id} failed:`, error.message);
  const scanId = job.data.scanId;
  const attemptsExhausted = job.attemptsMade >= Number(job.opts.attempts ?? 1);
  if (attemptsExhausted) {
    const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { status: true } });
    if (!scan) return;
    try {
      assertScanStatusTransition(scan.status, ScanStatus.FAILED);
    } catch (transitionError) {
      console.error("Could not mark scan failed:", transitionError);
      return;
    }
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: ScanStatus.FAILED,
        error: publicScanFailure(error)
      }
    }).catch((dbError: unknown) => console.error("Failed to mark scan as failed:", dbError));
  }
});

worker.on("error", (error) => console.error("Worker error:", error));

async function shutdown() {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}
process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
