import pino from "pino";

/** Standalone logger for code that runs outside an HTTP request (e.g. the Prisma audit extension). */
export const logger = pino();
