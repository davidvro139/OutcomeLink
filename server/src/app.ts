import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { sendData } from "./lib/apiResponse";

export function createApp() {
  const app = express();

  app.use(pinoHttp());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    sendData(res, { status: "ok" });
  });

  // Domain routers are mounted here as each module lands, e.g.:
  // app.use("/api/auth", authRouter);
  // app.use("/api/students", studentsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
