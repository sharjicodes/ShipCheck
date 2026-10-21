ALTER TABLE "Scan" ADD COLUMN "hostname" VARCHAR(253);
UPDATE "Scan" SET "hostname" = lower(CASE
  WHEN split_part(split_part("url", '://', 2), '/', 1) LIKE '[%]%'
    THEN trim(both '[]' from split_part(split_part("url", '://', 2), '/', 1))
  ELSE regexp_replace(split_part(split_part("url", '://', 2), '/', 1), ':[0-9]+$', '')
END);
ALTER TABLE "Scan" ALTER COLUMN "hostname" SET NOT NULL;
ALTER TABLE "Scan" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Scan" ADD COLUMN "durationMs" INTEGER;
CREATE INDEX "Scan_hostname_createdAt_idx" ON "Scan"("hostname", "createdAt");
