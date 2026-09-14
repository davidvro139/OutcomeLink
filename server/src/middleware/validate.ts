import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

type RequestPart = "body" | "query" | "params";

/** Parses and replaces req[part] with the validated value; a ZodError thrown here is caught by errorHandler. */
export function validate(schema: ZodSchema, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    req[part] = schema.parse(req[part]);
    next();
  };
}
