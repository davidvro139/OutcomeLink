import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { sendData } from "./lib/apiResponse";
import { prisma } from "./lib/prisma";
import { runWithRequestContext } from "./lib/requestContext";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";
import { accreditationRouter } from "./modules/accreditation";
import { auditRouter } from "./modules/audit";
import { authRouter } from "./modules/auth";
import { emailDeliveriesRouter } from "./modules/emailDeliveries";
import { employersRouter } from "./modules/employers";
import { evidenceRouter } from "./modules/evidence";
import { followupsRouter } from "./modules/followups";
import { importsRouter } from "./modules/imports";
import { jobRunsRouter } from "./modules/jobRuns";
import { licensureRouter } from "./modules/licensure";
import { notificationsRouter } from "./modules/notifications";
import { outcomesRouter } from "./modules/outcomes";
import { placementsRouter } from "./modules/placements";
import { programsRouter } from "./modules/programs";
import { reportsRouter } from "./modules/reports";
import { scheduledReportsRouter } from "./modules/scheduledReports";
import { settingsRouter } from "./modules/settings";
import { systemRouter } from "./modules/system";
import { searchRouter } from "./modules/search";
import { studentsRouter } from "./modules/students";
import { publicSurveysRouter, surveysRouter } from "./modules/surveys";
import { publicUsersRouter, usersRouter } from "./modules/users";

export function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(pinoHttp({ level: env.NODE_ENV === "test" ? "silent" : "info" }));
  // Standard security headers. The API serves JSON and file downloads to a
  // client on another origin, so cross-origin resource loading stays allowed
  // (CORS above decides who may actually read a response).
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Establishes the AsyncLocalStorage store this request's async chain runs in;
  // requireAuth fills in userId once the token is verified, and the Prisma
  // audit-log extension (src/lib/prisma.ts) reads it from there.
  app.use((_req, _res, next) => runWithRequestContext({}, next));

  // Liveness: the process is up. Readiness: it can also reach the database —
  // what a load balancer or container orchestrator should gate traffic on.
  app.get("/health", (_req, res) => {
    sendData(res, { status: "ok" });
  });
  app.get("/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      sendData(res, { status: "ready" });
    } catch {
      res.status(503).json({ error: { code: "NOT_READY", message: "Database is not reachable" } });
    }
  });

  app.use("/api", apiLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api", programsRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/students", placementsRouter);
  app.use("/api", outcomesRouter);
  app.use("/api", licensureRouter);
  app.use("/api/employers", employersRouter);
  app.use("/api/followups", followupsRouter);
  app.use("/api/evidence", evidenceRouter);
  app.use("/api/accreditation", accreditationRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api", surveysRouter);
  app.use("/api/public/surveys", publicSurveysRouter);
  app.use("/api/public/set-password", publicUsersRouter);
  app.use("/api/imports", importsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/scheduled-reports", scheduledReportsRouter);
  app.use("/api/job-runs", jobRunsRouter);
  app.use("/api/email-deliveries", emailDeliveriesRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/system", systemRouter);
  // Further domain routers are mounted here as each module lands.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
