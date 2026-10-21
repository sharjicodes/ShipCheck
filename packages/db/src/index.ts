import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { shipcheckPrisma?: PrismaClient };

export const prisma = globalForPrisma.shipcheckPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.shipcheckPrisma = prisma;

export { Prisma, ScanStatus } from "@prisma/client";
