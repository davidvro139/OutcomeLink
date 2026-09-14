# OutcomeLink Technology Stack

Finalizes spec §57 with specific choices and rationale. Two decisions deliberately deviate from the spec's original suggestion (Prisma over Sequelize; Mantine as the UI layer) — both were confirmed with the project owner rather than assumed.

## Repository layout

Single repo, npm workspaces monorepo:

```
OutcomeLink/
  client/     React + TypeScript app
  server/     Express + TypeScript API
  shared/     Types/enums/constants shared by both (e.g. outcome classification codes, role names)
  docs/       Spec, data model, this file, etc.
```

One repo keeps the domain vocabulary (enrollment statuses, role names, CPL metric enum) defined once in `shared/` instead of drifting between two codebases — relevant given how much of the spec depends on controlled vocabularies (§7, §11) rather than free text.

## Backend

| Concern                 | Choice                                                               | Why                                                                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime                 | Node.js LTS (22.x)                                                   | Current LTS at time of writing.                                                                                                                                                                                                                                    |
| Framework               | Express 4 + TypeScript                                               | Matches spec §57. Express 5 is out but ecosystem middleware compatibility is still catching up; not worth the risk on a project this size.                                                                                                                         |
| ORM                     | **Prisma**                                                           | Confirmed over Sequelize. Schema-first with generated TypeScript types end-to-end, first-class migration tooling (`prisma migrate`), and a query API that reads closer to the relational model in `docs/DATA_MODEL.md` than Sequelize's. Works fine against MySQL. |
| Database                | MySQL 8                                                              | Per spec §57.                                                                                                                                                                                                                                                      |
| Validation              | Zod                                                                  | Request body/query validation at the API boundary; schemas double as the source of truth for TypeScript types on the server side.                                                                                                                                  |
| Auth                    | JWT access token (short-lived, ~15 min) + httpOnly refresh cookie    | Balances the spec's "JWT or session-based" (§57) — httpOnly refresh cookie avoids storing a long-lived token in browser JS-accessible storage (XSS mitigation) while keeping the API stateless for access-token verification.                                      |
| Password hashing        | bcrypt (via `bcryptjs`, pure JS)                                     | `bcryptjs` avoids native-module compilation, which matters on this Windows dev machine — no build toolchain surprises. `argon2` is technically stronger but not worth the native-binding friction for this project's threat model.                                 |
| File uploads (Evidence) | `multer`, local disk in dev behind a small storage-adapter interface | Keeps the evidence-file storage swappable (e.g., to S3-compatible storage) without touching calling code, without building that abstraction out until it's actually needed.                                                                                        |
| Logging                 | `pino`                                                               | Structured JSON logs; useful once audit logging (§15) and validation runs need to be traced.                                                                                                                                                                       |
| Env config              | `dotenv` + a Zod-validated env schema                                | Fail fast on missing/malformed config rather than at first use.                                                                                                                                                                                                    |
| Testing                 | Jest + Supertest                                                     | Per spec §57.                                                                                                                                                                                                                                                      |

### Backend module layout

Per spec §58, exactly as listed there:

```
server/src/
  auth/ students/ programs/ outcomes/ employers/ placements/
  licensure/ followups/ surveys/ evidence/ reports/ audit/
  notifications/ imports/
  accreditation/
    frameworks/ rules/ classifiers/ calculators/ validators/ benchmarks/ explanations/
```

No accreditation logic in controllers — controllers call into `accreditation/` and return its output.

## Frontend

| Concern                | Choice                                                                                      | Why                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework              | React 18 + TypeScript                                                                       | Per spec §57.                                                                                                                                                                                                                                                                                                          |
| Build tool             | Vite                                                                                        | Standard modern choice; Create React App is deprecated.                                                                                                                                                                                                                                                                |
| Routing                | React Router v6                                                                             | De facto standard, supports the role-based route guarding the spec's role model (§4) needs.                                                                                                                                                                                                                            |
| Server state           | TanStack Query (React Query)                                                                | Handles caching/invalidation for the heavy list/detail/drill-down navigation pattern that's central to the product (§49) — drilling from a metric into records into a student is naturally a cache-friendly query chain.                                                                                               |
| UI components          | **Mantine** (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`, `@mantine/dates`) | Confirmed over Tailwind/shadcn and MUI. This app is overwhelmingly data tables, filter forms, drill-down panels, and dashboards — Mantine's component depth (DataTable via `mantine-datatable`, forms, date pickers) gets those built faster than assembling primitives, without MUI's harder-to-shed visual identity. |
| Forms                  | `@mantine/form` + `zod` (via `mantine-form-zod-resolver`)                                   | Stays inside the Mantine ecosystem instead of adding React Hook Form as a second forms library; Zod schemas can mirror the backend's validation schemas for the same entity.                                                                                                                                           |
| Charts                 | `@mantine/charts` (built on Recharts, Mantine-themed)                                       | Satisfies spec §57's "modern React charting library" while inheriting the same design tokens as the rest of the UI — no separate theming pass for charts.                                                                                                                                                              |
| Mapping (Phase 3, §35) | Leaflet + `react-leaflet`, OpenStreetMap tiles                                              | Per spec §57; deferred until geographic placement reporting is built.                                                                                                                                                                                                                                                  |
| Testing                | Vitest + React Testing Library                                                              | Vitest per spec §57's list; pairs naturally with Vite.                                                                                                                                                                                                                                                                 |
| E2E testing            | Cypress                                                                                     | Per spec §57.                                                                                                                                                                                                                                                                                                          |

## Cross-cutting

- **ESLint + Prettier** at the repo root, shared config across `client/` and `server/`.
- **Husky + lint-staged**: run lint/typecheck on staged files pre-commit — catches issues before they hit CI, cheap to set up now.
- **TypeScript**: `strict: true` everywhere; `shared/` package referenced by both `client` and `server` via workspace protocol, not copy-pasted.
- **CI**: GitHub Actions running lint, typecheck, and test suites on push/PR — added once there's enough code for it to be meaningful, not on day one.

## Deliberately not decided yet

- **`RuleSet.rule_definition` internal shape** — per `docs/DATA_MODEL.md` §13, this waits for official COE documentation review (spec §67). No library/format (JSON Schema, a DSL, etc.) is chosen yet.
- **Deployment target** (Railway/Render/Fly.io/other) for the public portfolio instance — not needed until there's something worth deploying.
