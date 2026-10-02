/** Standard pagination page sizes across the application. */
export const DEFAULT_PAGE_SIZE = 50;

/** Guidance strings for pagination visibility. */
export const PAGINATION_LABELS = {
  showing: (start: number, end: number, total: number) =>
    `Showing ${start}–${end} of ${total}`,
};
