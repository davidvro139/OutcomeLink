import cron from "node-cron";
import type { JobTrigger, JobType } from "@outcomelink/shared";
import type { JobRun, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type JsonObject = Record<string, unknown>;

export interface JobContext {
  runId: number;
  institutionId: number | null;
  params: JsonObject;
  attempt: number;
  maxAttempts: number;
  /** True on the last attempt this run will get — the moment to surface a failure to a human rather than retry quietly. */
  isFinalAttempt: boolean;
}

/**
 * Thrown by a handler that finished part of its work: `nextParams` narrows
 * the retry to only what failed, so a retry never redoes (or re-notifies
 * about) the parts that already succeeded.
 */
export class JobPartialFailure extends Error {
  constructor(
    message: string,
    public readonly nextParams: JsonObject,
  ) {
    super(message);
  }
}

export interface JobDefinition {
  type: JobType;
  /** Attempts a SCHEDULE run gets. A MANUAL run always gets exactly one — the person who clicked sees the failure at once and can retry from job history. */
  maxAttempts: number;
  /** Delay before the next attempt, given the attempt that just failed. */
  backoffMs: (failedAttempt: number) => number;
  handler: (ctx: JobContext) => Promise<JsonObject | void>;
  /** Cron cadence plus what to enqueue on each tick (typically one `runJob` per unit of work). */
  schedule?: { cron: string; trigger: () => Promise<void> };
}

const registry = new Map<JobType, JobDefinition>();

export function registerJob(def: JobDefinition): void {
  registry.set(def.type, def);
}

/** 1.25 min, 5, 11, then capped at 30 — enough to ride out a brief DB/network blip without hammering. */
export const DEFAULT_BACKOFF_MS = (failedAttempt: number) => 60_000 * Math.min(failedAttempt ** 2 * 1.25, 30);

/** A run stuck RUNNING this long is assumed to have died with its process (a restart, a crash). */
const STALE_RUNNING_MS = 60 * 60 * 1000;

function definitionFor(type: string): JobDefinition {
  const def = registry.get(type as JobType);
  if (!def) throw new Error(`No job registered for type "${type}"`);
  return def;
}

function asObject(value: Prisma.JsonValue | null): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

interface RunJobOptions {
  institutionId: number | null;
  params?: JsonObject;
  trigger: JobTrigger;
  requestedBy?: number;
  /** Rethrow the handler's original error after recording it — for a request/response caller that wants its own status code. */
  rethrow?: boolean;
}

/**
 * Creates a run and executes its first attempt in-line. On failure a
 * SCHEDULE run parks as RETRY_PENDING (picked up by processRetries); a
 * MANUAL run fails immediately.
 */
export async function runJob(type: JobType, options: RunJobOptions): Promise<JobRun> {
  const def = definitionFor(type);
  const run = await prisma.jobRun.create({
    data: {
      institutionId: options.institutionId,
      jobType: type,
      trigger: options.trigger,
      requestedBy: options.requestedBy,
      status: "RUNNING",
      attempt: 1,
      maxAttempts: options.trigger === "MANUAL" ? 1 : def.maxAttempts,
      params: (options.params ?? {}) as Prisma.InputJsonObject,
      startedAt: new Date(),
    },
  });
  return executeAttempt(run, def, options.rethrow ?? false);
}

async function executeAttempt(run: JobRun, def: JobDefinition, rethrow: boolean): Promise<JobRun> {
  const params = asObject(run.params);
  try {
    const result = await def.handler({
      runId: run.id,
      institutionId: run.institutionId,
      params,
      attempt: run.attempt,
      maxAttempts: run.maxAttempts,
      isFinalAttempt: run.attempt >= run.maxAttempts,
    });
    return await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        result: (result ?? {}) as Prisma.InputJsonObject,
        errorMessage: null,
        finishedAt: new Date(),
        nextAttemptAt: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const willRetry = run.attempt < run.maxAttempts;
    const updated = await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: willRetry ? "RETRY_PENDING" : "FAILED",
        errorMessage: message,
        params: (err instanceof JobPartialFailure ? err.nextParams : params) as Prisma.InputJsonObject,
        finishedAt: willRetry ? null : new Date(),
        nextAttemptAt: willRetry ? new Date(Date.now() + def.backoffMs(run.attempt)) : null,
      },
    });
    if (!willRetry && rethrow) throw err;
    return updated;
  }
}

/** Runs every RETRY_PENDING attempt that's due. Each is claimed atomically first, so two server instances can't both run one. */
export async function processRetries(): Promise<void> {
  await recoverStaleRuns();
  const due = await prisma.jobRun.findMany({
    where: { status: "RETRY_PENDING", nextAttemptAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const { id } of due) {
    const claimed = await prisma.jobRun.updateMany({
      where: { id, status: "RETRY_PENDING" },
      data: { status: "RUNNING", attempt: { increment: 1 }, startedAt: new Date(), nextAttemptAt: null },
    });
    if (claimed.count !== 1) continue;
    const run = await prisma.jobRun.findUniqueOrThrow({ where: { id } });
    try {
      await executeAttempt(run, definitionFor(run.jobType), false);
    } catch (err) {
      console.error(`Job run ${id} retry crashed`, err);
    }
  }
}

async function recoverStaleRuns(): Promise<void> {
  const stale = await prisma.jobRun.findMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
  });
  for (const run of stale) {
    const willRetry = run.attempt < run.maxAttempts;
    await prisma.jobRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: {
        status: willRetry ? "RETRY_PENDING" : "FAILED",
        errorMessage: "Interrupted before it finished (the server likely restarted mid-run)",
        finishedAt: willRetry ? null : new Date(),
        nextAttemptAt: willRetry ? new Date() : null,
      },
    });
  }
}

/** Runs a FAILED run again on the same row (a person clicking Retry in job history). Returns null if it was no longer FAILED. */
export async function retryFailedRun(runId: number): Promise<JobRun | null> {
  const run = await prisma.jobRun.findUniqueOrThrow({ where: { id: runId } });
  const claimed = await prisma.jobRun.updateMany({
    where: { id: runId, status: "FAILED" },
    data: {
      status: "RUNNING",
      attempt: run.attempt + 1,
      maxAttempts: Math.max(run.maxAttempts, run.attempt + 1),
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) return null;
  return executeAttempt(await prisma.jobRun.findUniqueOrThrow({ where: { id: runId } }), definitionFor(run.jobType), false);
}

/** Only reached from the real server entrypoint (see server/src/index.ts), never from tests. */
export function startJobRunner(): void {
  cron.schedule("* * * * *", () => {
    void processRetries().catch((err) => console.error("Job retry sweep failed", err));
  });
  for (const def of registry.values()) {
    if (!def.schedule) continue;
    cron.schedule(def.schedule.cron, () => {
      void def.schedule!.trigger().catch((err) => console.error(`Scheduled trigger for ${def.type} failed`, err));
    });
  }
}
