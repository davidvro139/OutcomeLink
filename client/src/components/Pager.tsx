import { Pagination, type PaginationProps } from "@mantine/core";

const CONTROL_LABELS: Record<string, string> = {
  first: "First page",
  previous: "Previous page",
  next: "Next page",
  last: "Last page",
};

/**
 * Mantine's Pagination renders its first/previous/next/last controls as
 * icon-only buttons with no accessible name, so a screen reader announces
 * them as just "button". This gives them names (and the page buttons a
 * "Page n" label) — use it instead of a bare Pagination everywhere.
 */
export function Pager(props: Omit<PaginationProps, "getControlProps" | "getItemProps">) {
  return (
    <Pagination
      {...props}
      getControlProps={(control) => ({ "aria-label": CONTROL_LABELS[control] ?? control })}
      getItemProps={(page) => ({ "aria-label": `Page ${page}` })}
    />
  );
}
