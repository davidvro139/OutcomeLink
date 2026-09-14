import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userId?: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Established once per request in app.ts; carries the acting user into the Prisma audit-log extension. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
