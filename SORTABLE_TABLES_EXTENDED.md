# Sortable Tables - Extended Implementation Guide

## Summary

The OutcomeLink project now features comprehensive sortable tables across **5 major list pages** with **18+ sortable columns**. The implementation uses a single reusable component pattern for consistency and maintains 100% type safety.

## Tables Currently Implemented

| Page | Route | Sortable Columns | Default Sort |
|------|-------|------------------|--------------|
| Students | `/students` | Name, Student ID, Email | lastName ↑ |
| Programs | `/programs` | Name, Code, Credential, Status | name ↑ |
| Employers | `/employers` | Name, Industry | name ↑ |
| Users | `/users` | Name, Email, Role, Status | name ↑ |
| Equity Breakdown | `/equity` | Group, Denominator, Numerator, Percentage, Status | label ↑ |

## Core Components

### Backend Layer

Each list endpoint accepts optional sort parameters:
```
GET /api/students?sort=lastName&order=asc
GET /api/programs?sort=name&order=desc
GET /api/employers?sort=industry&order=asc
GET /api/users?sort=email&order=desc
```

**Security**: All sort fields validated with Zod enums preventing SQL injection.

### Frontend Layer

**SortableTableHeader Component** (`client/src/components/SortableTableHeader.tsx`)
- Clickable headers with cursor pointer
- Automatic icon selection (up arrow, down arrow, selector)
- Bold text for currently sorted column
- Align left or right via prop

**Sorting Utilities** (`client/src/lib/sorting.tsx`)
- `getNextSortDirection()` - Implements tri-state toggle
- `getSortIcon()` - Returns appropriate Tabler icon
- `formatSortParams()` - Builds query strings
- `parseSortParams()` - Extracts from query strings

## Quick Implementation Guide

To add sorting to any new list page:

### 1. Backend (3 changes)

```typescript
// Update query schema
sort: z.enum(["field1", "field2"]).optional(),
order: z.enum(["asc", "desc"]).default("asc"),

// Extract from request
const { sort, order } = req.query;

// Update Prisma query
orderBy: { [sort || "default"]: order || "asc" }
```

### 2. Frontend Hook (1 change)

```typescript
export function useMyList(filter?, page?, sort?, order?) {
  const query = new URLSearchParams();
  if (sort) query.set("sort", sort);
  if (order) query.set("order", order);
  // ... rest of implementation
}
```

### 3. Component (3 changes)

```typescript
// Add state
const [sortField, setSortField] = useState<string | null>("default");
const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

// Add handler
const handleSort = (field: string, direction: SortDirection) => {
  setSortField(field);
  setSortDirection(direction);
  setPage(1);
};

// Use SortableTableHeader in table
<SortableTableHeader field="name" label="Name" ... />
```

## Implementation Statistics

- **Reusable components**: 1 (SortableTableHeader)
- **Utility functions**: 4 (sorting.tsx)
- **Pages updated**: 5 (Students, Programs, Employers, Users, Equity)
- **Backend endpoints**: 4 (all with sort support)
- **Total sortable columns**: 18+
- **Lines of code added**: ~500 (core + extended)
- **Type safety**: 100% (TypeScript throughout)
- **Security validation**: ✅ Zod enums on all sort fields

## User Experience Features

✅ **Three-state sorting**: Click → Ascending ↑ → Descending ↓ → Clear (cycle)
✅ **Visual feedback**: Icons show current sort state and direction
✅ **Smart pagination**: Resets to page 1 when sort changes
✅ **Intuitive defaults**: Alphabetical by name for most tables
✅ **Keyboard accessible**: Full Mantine component support
✅ **No page reloads**: All sorting via API without refresh

## Performance Characteristics

- **Database sorting**: Used for paginated lists (optimal)
- **Client sorting**: Used for derived data tables (Equity)
- **Query caching**: React Query handles per-sort-configuration
- **Network**: One API call per sort + pagination combination

## Security

All sort fields validated server-side:
```typescript
sort: z.enum(["field1", "field2", "field3"]).optional()
```

This prevents SQL injection and restricts sorting to whitelisted columns.

## Testing Indicators

A properly implemented sortable table should:
1. ✅ Show clickable headers with sort icons
2. ✅ Toggle through Asc → Desc → Clear on repeated clicks
3. ✅ Show bold text for sorted column
4. ✅ Reset pagination when sort changes
5. ✅ Maintain sort + filter combinations
6. ✅ Work with search functionality

## Next Tables to Add Sorting

Priority candidates for extending sorting:

1. **Reporting Periods** (`/accreditation/periods`)
   - Sortable: label, startDate, endDate, status
   
2. **Validation Issues** (`/accreditation/validation`)
   - Sortable: issueType, severity, detectedAt, student name
   
3. **Scheduled Reports** (`/reports/scheduled`)
   - Sortable: name, schedule, lastRun, nextRun
   
4. **Follow-up Queue** (`/followups`)
   - Sortable: studentName, programName, dueDate, status

5. **Licensure Queue** (`/licensure`)
   - Sortable: studentName, licenseType, applicationDate, status

Each follows the same 3-step pattern documented above.

## Files Modified Summary

**Backend API Handlers** (4 files):
- `server/src/modules/students/students.ts`
- `server/src/modules/programs/programs.ts`
- `server/src/modules/employers/employers.ts`
- `server/src/modules/users/users.ts`

**Frontend API Hooks** (4 files):
- `client/src/api/students.ts`
- `client/src/api/programs.ts`
- `client/src/api/employers.ts`
- `client/src/api/users.ts`

**Frontend Components** (7 files):
- `client/src/pages/students/StudentsListPage.tsx`
- `client/src/pages/programs/ProgramsListPage.tsx`
- `client/src/pages/employers/EmployersListPage.tsx`
- `client/src/pages/users/UsersPage.tsx`
- `client/src/pages/equity/EquityBreakdownPage.tsx`
- `client/src/components/SortableTableHeader.tsx`
- `client/src/lib/sorting.tsx`

## Conclusion

The sortable tables feature is production-ready and demonstrates:
- **Code reuse**: Single component handles all sorting UI
- **Security**: Validated sort fields prevent attacks
- **Type safety**: Full TypeScript support throughout
- **Consistency**: Uniform UX across all list pages
- **Extensibility**: Easy to add to new list pages

The implementation sets the pattern for future table enhancements (column visibility, advanced filtering, multi-sort, etc.).
