import { z } from "zod";

export const createScanSchema = z.object({
  url: z.string().trim().min(1).max(2048).url()
});

export const scanIdSchema = z.object({ id: z.string().min(1).max(64) });

export const scanHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["queued", "running", "completed", "failed"]).optional(),
  hostname: z.string().max(253).optional()
});
