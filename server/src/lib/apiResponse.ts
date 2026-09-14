import type { Response } from "express";

/**
 * Standard response envelope (spec §59). Every successful response carries
 * `data`; list endpoints additionally carry `meta.pagination`.
 */
export function sendData<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ data });
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function sendPaginated<T>(res: Response, items: T[], pagination: Pagination) {
  return res.status(200).json({ data: items, meta: { pagination } });
}

export function toPagination(page: number, pageSize: number, totalItems: number): Pagination {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}
