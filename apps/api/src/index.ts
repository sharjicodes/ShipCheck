import Fastify from "fastify";
import cors from "@fastify/cors";
import { Prisma, ScanStatus } from "@shipcheck/db";
import { prisma } from "@shipcheck/db";
import { scanQueue, connection } from "./queue.js";
import { validatePublicUrl } from "./url-safety.js";
import { createScanSchema, scanHistoryQuerySchema, scanIdSchema } from "./schemas/scan.js";
import { assertScanStatusTransition } from "./scan-status.js";

const app = Fastify({
  logger: true,
  bodyLimit: 16 * 1024,
  requestTimeout: 10_000
});

const webOrigins = new Set((process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean));
if (process.env.NODE_ENV !== "production") webOrigins.add("http://localhost:3001");

await app.register(cors, { origin: [...webOrigins] });

app.get("/health", async (_request, reply) => {
  const [database, redis] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    connection.ping()
  ]);
  const healthy = database.status === "fulfilled" && redis.status === "fulfilled" && redis.value === "PONG";
  if (!healthy) reply.code(503);
  return {
    ok: healthy,
    database: database.status === "fulfilled" ? "ok" : "unavailable",
    redis: redis.status === "fulfilled" && redis.value === "PONG" ? "ok" : "unavailable"
  };
});

app.post("/api/scans", async (request, reply) => {
  const parsed = createScanSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Provide a valid website URL." });

  let safeUrl: string;
  try {
    safeUrl = await validatePublicUrl(parsed.data.url);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "URL is not allowed." });
  }

  const scan = await prisma.scan.create({
    data: { url: safeUrl, hostname: new URL(safeUrl).hostname.toLowerCase(), status: ScanStatus.QUEUED }
  });

  try {
    await scanQueue.add("accessibility-scan", { scanId: scan.id, url: safeUrl }, {
      jobId: scan.id,
      attempts: 2,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 100,
      removeOnFail: 100
    });
  } catch (error) {
    assertScanStatusTransition(scan.status, ScanStatus.FAILED);
    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: ScanStatus.FAILED, error: "Could not enqueue scan." }
    });
    request.log.error(error);
    return reply.code(503).send({ error: "Scan queue is temporarily unavailable. Try again." });
  }

  return reply.code(202).send({ scan: serializeScan(scan) });
});

app.get("/api/scans/:id", async (request, reply) => {
  const params = scanIdSchema.safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid scan ID." });

  const scan = await prisma.scan.findUnique({ where: { id: params.data.id } });
  if (!scan) return reply.code(404).send({ error: "Scan not found." });
  return { scan: serializeScan(scan) };
});

app.get("/api/scans", async (request, reply) => {
  const query = scanHistoryQuerySchema.safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid history filters." });
  const where = {
    ...(query.data.status ? { status: query.data.status.toUpperCase() as ScanStatus } : {}),
    ...(query.data.hostname ? { hostname: query.data.hostname.toLowerCase() } : {})
  };
  const [scans, total] = await Promise.all([
    prisma.scan.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.data.page - 1) * query.data.limit, take: query.data.limit }),
    prisma.scan.count({ where })
  ]);
  return { scans: scans.map(serializeScan), page: query.data.page, limit: query.data.limit, total };
});

function serializeScan(scan: {
  id: string; url: string; status: ScanStatus; error: string | null;
  hostname?: string; createdAt: Date; startedAt?: Date | null; completedAt: Date | null; durationMs?: number | null; summary: Prisma.JsonValue | null;
  findings: Prisma.JsonValue | null;
}) {
  return {
    ...scan,
    status: scan.status.toLowerCase(),
    createdAt: scan.createdAt.toISOString(),
    startedAt: scan.startedAt?.toISOString() ?? null,
    completedAt: scan.completedAt?.toISOString() ?? null,
    durationMs: scan.durationMs ?? null,
    summary: scan.summary,
    findings: scan.findings
  };
}

const shutdown = async () => {
  await app.close();
  await scanQueue.close();
  await connection.quit();
  await prisma.$disconnect();
};
process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

const port = Number(process.env.API_PORT ?? 4000);
await app.listen({ host: process.env.API_HOST ?? "127.0.0.1", port });
