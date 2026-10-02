# Sortable Tables Implementation

This document describes the sortable tables feature added to OutcomeLink, including architecture, implementation, and how to extend it to additional tables.

## Overview

Sortable tables provide users with the ability to click column headers to sort data in ascending or descending order. The implementation includes:

- **Backend**: Query parameter validation and dynamic orderBy in Prisma queries
- **Frontend**: Reusable `SortableTableHeader` component and sorting utilities
- **UX**: Visual indicators (icons) showing current sort state and direction

## Architecture

### Backend (Server)

**File**: `server/src/modules/students/students.ts`

The students list endpoint accepts sort parameters:
- `sort`: Column name to sort by (validated enum: firstName, lastName, internalStudentId, email)
- `order`: Sort direction (asc or desc, default: asc)

```typescript
export const listStudentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(["firstName", "lastName", "internalStudentId", "email"]).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
});
```

The list function dynamically builds the orderBy clause:
```typescript
const orderByField = sort || "lastName";
const orderByDirection = order || "asc";

prisma.student.findMany({
  where,
  skip,
  take,
  orderBy: { [orderByField]: orderByDirection },
})
```

### Frontend Utilities

**File**: `client/src/lib/sorting.tsx`

Provides helper functions for sorting:
- `getNextSortDirection(currentField, clickedField, currentDirection)`: Determines next sort state
- `getSortIcon(field, sortField, sortDirection)`: Returns appropriate icon (up/down/selector)
- `formatSortParams(field, direction)`: Formats sort parameters for URL
- `parseSortParams(params)`: Parses sort parameters from URL

### Component

**File**: `client/src/components/SortableTableHeader.tsx`

Reusable component that replaces static `<Table.Th>` elements:

```tsx
<Table.Th>
  <SortableTableHeader
    field="lastName"
    label="Name"
    sortField={sortField}
    sortDirection={sortDirection}
    onSort={handleSort}
  />
</Table.Th>
```

Features:
- Clickable headers with cursor pointer
- Icons showing sort state (upward arrow, downward arrow, or selector)
- Bold text for currently sorted column
- Align left or right via `align` prop

### API Hook

**File**: `client/src/api/students.ts`

Updated `useStudents` hook to accept and pass sort parameters:
```typescript
export function useStudents(
  search?: string,
  page = 1,
  sort?: string,
  order?: "asc" | "desc"
) {
  const query = new URLSearchParams({ pageSize: "50", page: String(page) });
  if (search) query.set("search", search);
  if (sort) query.set("sort", sort);
  if (order) query.set("order", order);

  return useQuery({
    queryKey: ["students", search, page, sort, order],
    queryFn: () => apiRequestPaginated<Student>(`/api/students?${query.toString()}`),
  });
}
```

## Implemented Tables

### 1. Students List Page
**File**: `client/src/pages/students/StudentsListPage.tsx`

Sortable columns:
- Name (lastName)
- Student ID (internalStudentId)
- Email (email)

Default sort: lastName ascending

### 2. Equity Breakdown Page
**File**: `client/src/pages/equity/EquityBreakdownPage.tsx`

Sortable columns:
- Group (label)
- Denominator (denominator)
- Numerator (numerator)
- Percentage (percentage)
- Status (status)

Default sort: label ascending

Note: Equity groups are sorted client-side via `useMemo` since they're derived data from the API.

## How to Add Sorting to Other Tables

Follow these steps to add sorting to any table in the project:

### 1. Update Backend API (if needed)

For list endpoints that return paginated data:

**Step 1a**: Update the query schema
```typescript
export const listYourThingsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(["field1", "field2", "field3"]).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
});
type ListYourThingsQuery = z.infer<typeof listYourThingsQuerySchema>;
```

**Step 1b**: Update the handler function
```typescript
export async function list(req: Request, res: Response) {
  const { page, pageSize, search, sort, order } = req.query as unknown as ListYourThingsQuery;
  // ... authorization and filtering logic ...
  
  const orderByField = sort || "defaultField";
  const orderByDirection = order || "asc";

  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) =>
      prisma.yourModel.findMany({
        where,
        skip,
        take,
        orderBy: { [orderByField]: orderByDirection },
      }),
    () => prisma.yourModel.count({ where }),
  );
}
```

### 2. Update Frontend API Hook

**File**: `client/src/api/yourThing.ts`

```typescript
export function useYourThings(
  search?: string,
  page = 1,
  sort?: string,
  order?: "asc" | "desc"
) {
  const query = new URLSearchParams({ pageSize: "50", page: String(page) });
  if (search) query.set("search", search);
  if (sort) query.set("sort", sort);
  if (order) query.set("order", order);

  return useQuery({
    queryKey: ["yourThings", search, page, sort, order],
    queryFn: () => apiRequestPaginated<YourThing>(`/api/your-things?${query.toString()}`),
    placeholderData: (previousData) => previousData,
  });
}
```

### 3. Update Component

**File**: `client/src/pages/yourPage/YourListPage.tsx`

Add imports:
```typescript
import { SortableTableHeader } from "../../components/SortableTableHeader";
import type { SortDirection } from "../../lib/sorting";
```

Add sort state:
```typescript
const [sortField, setSortField] = useState<string | null>("defaultField");
const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

const handleSort = (field: string, direction: SortDirection) => {
  setSortField(field);
  setSortDirection(direction);
  setPage(1);
};
```

Call the hook with sort params:
```typescript
const { data, isLoading } = useYourThings(
  debouncedSearch || undefined,
  page,
  sortField || undefined,
  sortDirection,
);
```

Replace table headers:
```typescript
<Table.Th>
  <SortableTableHeader
    field="fieldName"
    label="Display Label"
    sortField={sortField}
    sortDirection={sortDirection}
    onSort={handleSort}
  />
</Table.Th>
```

## Client-Side Sorting (Derived Data)

For tables showing derived data (not from paginated APIs), implement client-side sorting:

```typescript
const sortedItems = useMemo(() => {
  if (!items) return [];
  const sorted = [...items];
  if (!sortField) return sorted;

  return sorted.sort((a, b) => {
    let aVal = a[sortField as keyof typeof a];
    let bVal = b[sortField as keyof typeof b];

    if (aVal === null || aVal === undefined) aVal = "";
    if (bVal === null || bVal === undefined) bVal = "";

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });
}, [items, sortField, sortDirection]);
```

Then use `sortedItems` in the table body instead of `items`.

## Validation and Security

### Backend Validation
- Sort field is validated with a Zod enum to prevent SQL injection
- Only whitelisted fields can be sorted
- Order is validated to be either "asc" or "desc"

### Frontend Validation
- The `SortableTableHeader` component only accepts valid field names
- TypeScript ensures type safety

## Performance Considerations

1. **Database-level sorting**: Preferred for paginated list endpoints (automatic with Prisma)
2. **Client-side sorting**: Used for small derived datasets (trend data, equity groups)
3. **Query caching**: React Query caches results per sort configuration automatically

## UX Best Practices

1. **Default sort**: Set a sensible default sort field (usually lastName or name)
2. **Reset page**: When sort changes, reset to page 1
3. **Visual feedback**: SortableTableHeader shows current sort state with icons
4. **Accessibility**: Clickable headers should be keyboard accessible (Mantine handles this)

## Future Enhancements

Potential improvements to the sorting system:

1. **Multi-column sorting**: Support sorting by multiple columns
2. **Sort persistence**: Save user's sort preferences in localStorage or server
3. **Column visibility**: Allow users to hide/show columns
4. **Export with sort**: Include sort state in Excel exports
5. **Advanced filters**: Combine sorting with advanced filtering options

## Testing

To test sortable tables:

1. Click a column header - should sort ascending and show up arrow
2. Click again - should sort descending and show down arrow
3. Click a different column - should sort by new column ascending
4. Verify sort state persists during pagination
5. Verify search + sort combinations work correctly

Example: Students page
- Click "Name" → sorts by lastName ascending
- Click "Name" again → sorts by lastName descending
- Click "Student ID" → sorts by internalStudentId ascending
- Type search term → results stay sorted
- Click pagination → sort state persists
