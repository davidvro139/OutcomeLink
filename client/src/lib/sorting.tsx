import type { ReactNode } from "react";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";

export type SortDirection = "asc" | "desc";

export interface SortState {
  field: string | null;
  direction: SortDirection;
}

/** Get the next sort direction when clicking a column header */
export function getNextSortDirection(
  currentField: string | null,
  clickedField: string,
  currentDirection: SortDirection,
): SortDirection {
  if (currentField !== clickedField) return "asc";
  return currentDirection === "asc" ? "desc" : "asc";
}

/** Get the appropriate sort icon for a column header */
export function getSortIcon(
  field: string,
  sortField: string | null,
  sortDirection: SortDirection,
): ReactNode {
  if (sortField !== field) return <IconSelector size={16} />;
  return sortDirection === "asc" ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />;
}

/** Format sort parameters for URL query string */
export function formatSortParams(field: string | null, direction: SortDirection) {
  if (!field) return "";
  return `&sort=${field}&order=${direction}`;
}

/** Parse sort parameters from URL query string */
export function parseSortParams(
  params: URLSearchParams,
): { field: string | null; direction: SortDirection } {
  const field = params.get("sort");
  const direction = (params.get("order") as SortDirection) || "asc";
  return { field, direction: direction === "desc" ? "desc" : "asc" };
}
