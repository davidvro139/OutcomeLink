import type { NextFunction, Request, Response } from "express";

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Express 4 doesn't catch rejected promises from async handlers — this forwards them to errorHandler. */
export function asyncHandler(handler: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
