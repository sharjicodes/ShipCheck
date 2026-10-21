CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TABLE "Scan" (
  "id" TEXT NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
  "error" VARCHAR(1000),
  "summary" JSONB,
  "findings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Scan_createdAt_idx" ON "Scan"("createdAt");
CREATE INDEX "Scan_status_createdAt_idx" ON "Scan"("status", "createdAt");
