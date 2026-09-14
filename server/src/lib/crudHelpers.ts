import type { Response } from "express";
import { sendPaginated, toPagination } from "./apiResponse";

/** Runs the page's fetch and the total count in parallel and sends the standard paginated envelope. */
export async function paginatedResponse<T>(
  res: Response,
  page: number,
  pageSize: number,
  fetchItems: (skip: number, take: number) => Promise<T[]>,
  countItems: () => Promise<number>,
) {
  const skip = (page - 1) * pageSize;
  const [items, totalItems] = await Promise.all([fetchItems(skip, pageSize), countItems()]);
  sendPaginated(res, items, toPagination(page, pageSize, totalItems));
}
