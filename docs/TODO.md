# OutcomeLink Build Plan

Working checklist toward the Phase 1 / MVP scope defined in the spec (§62), sequenced so each stage produces something runnable before the next begins. Check items off as they land; add dated notes inline if a decision changes.

## 0. Repo & tooling setup

- [x] Scaffold npm workspaces monorepo: `client/`, `server/`, `shared/` (see `docs/TECH_STACK.md`)
- [x] Root `tsconfig.base.json` + per-package `tsconfig.json`
- [x] ESLint + Prettier shared config
- [x] Husky + lint-staged pre-commit hook (lint + typecheck on staged files)
- [x] `.env.example` for `server/` (DB connection, JWT secret, etc.) — also added for `client/` (`VITE_API_URL`)
- [x] `shared/` package: role names, enrollment statuses, outcome classification codes, CPL metric enum (Completion/Placement/Licensure) — plus follow-up methods/outcomes and evidence types
- [x] Express app scaffold with health-check route, standard response/error envelope (spec §59), and the full module folder layout from spec §58 (this was originally listed under stage 2, but landed alongside the rest of the scaffold since it's tooling, not feature work)
- [x] Vite + React + TS client scaffold with Mantine/TanStack Query/React Router wired up and a connectivity-check dashboard page (originally stage 5 — same reasoning)

## 1. Database & Prisma

- [x] Install Prisma, point at local MySQL instance (MySQL 8.0 running as a local Windows service; dedicated `outcomelink` DB)
- [x] Translate `docs/DATA_MODEL.md` entities into `server/prisma/schema.prisma`, one entity group at a time (org structure → students → accreditation engine → outcomes → employers → follow-up/evidence → surveys → governance → operations) — 33 models, `prisma validate` and `prisma generate` both clean
- [x] First migration; confirm it applies cleanly to a fresh MySQL database — applied and verified via `SHOW TABLES`. Also added a follow-up migration for the `Evidence`/`VerificationRecord` "exactly one target" CHECK constraints flagged in §13; required setting `onDelete`/`onUpdate` to `Restrict` on those relations since MySQL forbids a CHECK on a column governed by a cascading FK action (Prisma's default for optional relations)
- [x] Seed script skeleton (empty for now — real synthetic data is step 8)

## 2. Backend foundation

- [x] Express + TypeScript app scaffold, module folders per spec §58 — done in stage 0
- [x] API conventions from `docs/TECH_STACK.md`/spec §59: response envelope, pagination params, standard error shape — done in stage 0
- [x] Zod request-validation middleware (`server/src/middleware/validate.ts`)
- [x] Auth: register/login, JWT access token + httpOnly refresh cookie, bcrypt password hashing (`server/src/modules/auth/`) — verified end-to-end against the real database (register, login, /me, /refresh, plus the wrong-password/duplicate-email/short-password error paths)
- [x] Role-based authorization middleware, including program-level and campus-level scoping (`UserProgramAccess`, `UserCampusAccess`) — `requireAuth`/`requireRole`/`requireProgramAccess`/`requireCampusAccess` in `server/src/middleware/auth.ts`, ready to apply once Program/Campus routes exist in stage 3
- [x] Generic audit-log service wired as a Prisma Client Extension (`server/src/lib/prisma.ts`) rather than a per-call service — automatically writes one `AuditLogEntry` row per changed field on every create/update/delete through the exported `prisma` client, attributing it to the request's user via `AsyncLocalStorage` (`server/src/lib/requestContext.ts`). Verified with a scripted update. Known scope boundary: only single-record create/update/delete are covered, not `*Many`/`upsert`/nested relation writes
- [x] Health-check endpoint + basic request logging (pino) — done in stage 0

**Checkpoint reached:** registered a user, logged in, and hit an authenticated `/api/auth/me` with a real bearer token against the live database. Role enforcement (`requireRole`) is implemented but has no protected route to exercise yet — that arrives with stage 3 CRUD.

**Follow-up (not yet done):** self-registration (`POST /api/auth/register`) is currently open to anyone and lets the caller pick any role, including `SYSTEM_ADMINISTRATOR` — fine for bootstrapping with no user-management UI yet, but must be locked down (admin-created users, or "first user in a new institution only") before this goes anywhere near production.

**Also fixed along the way:** `@types/express` had drifted to v5 (mismatched against the actual Express 4 runtime) both directly and via `@types/cookie-parser`/`@types/multer`'s own nested copies, causing `app.use()` overload errors. Pinned to v4 tree-wide via root `package.json` `overrides`.

## 3. Core CRUD (non-accreditation)

- [x] Institution / Campus / Department / Program (`server/src/modules/programs/`) — single-row Institution get/update, full Campus/Department/Program CRUD scoped to institution, nested Cohort under Program. Mutations restricted to System Administrator
- [x] Student, StudentCommunicationPreference, StudentEnrollment (`server/src/modules/students/`) — per-institution duplicate internal-ID detection (409), name/ID search, nested enrollment and communication-preference (consent/do-not-contact) endpoints
- [x] Employer, EmployerContact (`server/src/modules/employers/`) — search/filter, nested contacts
- [x] EmploymentRecord (`server/src/modules/placements/`, historical, never overwritten — spec §8) — a job change is a new record via create(), not a mutation of the old one; no delete endpoint, for the same reason
- [x] FollowUpAttempt + Follow-Up Queue endpoint (`server/src/modules/followups/`) — program/campus/staff/outcome/minAttempts/minDaysOverdue filters implemented; the spec's "reporting period" filter deferred until the outcomes/accreditation modules exist. Refuses to log an attempt against a do-not-contact student (409)
- [x] Evidence upload endpoint (`server/src/modules/evidence/`, multer + `server/src/lib/storage.ts`'s `StorageAdapter` interface, local disk for now) — enforces the "exactly one target" invariant (outcomeRecordId/employmentRecordId/licensureResultId) in application code ahead of the database CHECK constraint, with a download route that streams the file back after an institution-ownership check

**Checkpoint reached:** created a program, enrolled a student, logged employment, recorded a follow-up attempt (and verified the do-not-contact refusal), and uploaded + downloaded evidence — all through the API against the live database. Role enforcement verified (403 for a non-admin creating a program, 200 for listing).

**Follow-ups (not yet done):**
- List endpoints don't yet filter rows by program/campus access scope for program-/campus-scoped roles (e.g., a Program Administrator can currently list all programs, not just their assigned ones) — `requireProgramAccess`/`requireCampusAccess` exist and are ready to apply to single-resource routes, but list-query-level scoping needs its own filter logic.
- The Follow-Up Queue computes `daysOverdue`/`minAttempts` filtering in application code after a full institution-scoped fetch (documented in `queue.ts`) — fine at this project's data scale, but not a pattern to reuse for a larger dataset without revisiting.
- Evidence's `outcomeRecordId` and `licensureResultId` targets are validated for shape and institution ownership, but neither `StudentOutcomeRecord` nor `LicensureResult` has an owning CRUD module yet (accreditation engine and Phase 2's licensure workflow, respectively), so only the `employmentRecordId` path is exercised end-to-end so far.

## 4. Accreditation engine (do not skip the reading)

- [ ] **Obtain and read official COE CPL documentation for the target reporting year before writing any rule logic** (spec §67 — non-negotiable gate for this section)
- [ ] Build the documented rule matrix: COE definition → classification → numerator behavior → denominator behavior → exclusion behavior → validation rules → automated tests
- [ ] AccreditationFramework / RuleSet / ReportingPeriod CRUD (admin configuration)
- [ ] Classifier interface + COE-2026 implementation, driven by the rule matrix — one classification per (student enrollment, reporting period, metric) per `docs/DATA_MODEL.md`
- [ ] Calculator interface for Completion / Placement / Licensure + unit tests against the rule matrix's worked examples
- [ ] Explanation generator backing "How This Student Counts" (`CplCalculationExplanation`)
- [ ] Validation engine: ERROR/WARNING/INFORMATION checks from spec §22
- [ ] Reporting Period finalize/reopen workflow (spec §25)
- [ ] Duplicate Student Resolution merge workflow (spec §23)

**Checkpoint:** a reporting period's CPL numbers can be computed from seeded student records, drilled down to individual students, and each student's inclusion/exclusion is explained.

## 5. Frontend foundation

- [x] Vite + React + TS scaffold, Mantine provider/theme setup — done in stage 0
- [ ] React Router layout shell with role-based route guarding
- [x] TanStack Query client + typed API client wrapper (reusing `shared/` types) — basic client wired in stage 0 (`src/lib/apiClient.ts`); role-aware/auth-aware version still needed once auth exists
- [ ] Login page + silent token refresh handling
- [ ] App shell: nav, global search (spec §54)

**Checkpoint:** can log in through the UI and see an empty authenticated shell.

## 6. MVP feature screens

- [ ] Program list/detail
- [ ] Student list/detail, enrollment, outcome record entry
- [ ] Employer CRM screens (list/detail, contacts)
- [ ] Follow-up queue screen with filters and overdue highlighting
- [ ] Evidence upload/viewer on outcome and employment records
- [ ] CPL dashboard with full drill-down (metric → records → student → classification → evidence → audit history, spec §53)
- [ ] Program comparison view (spec §28, MVP-scoped subset)
- [ ] Data validation / readiness screen (ERROR/WARNING/INFORMATION list, clickable)
- [ ] Basic audit history view on a record

**Checkpoint:** MVP scope (spec §62) is feature-complete end to end.

## 7. Testing

- [ ] Jest + Supertest set up in `server/`, first tests on auth + one CRUD module
- [ ] Vitest + React Testing Library set up in `client/`
- [ ] Cypress set up with one smoke E2E flow (login → create student → view CPL dashboard)
- [ ] Accreditation engine test matrix built directly from the rule matrix (spec §55) — classifications, numerator/denominator inclusion, exclusions, boundary conditions, missing data, historical rule sets

## 8. Demo data

- [ ] Synthetic data generator (`@faker-js/faker`) for Mountain West Technical College (Main + North campus)
- [ ] Seed 1,000+ students, 100+ employers, 3–5 reporting years
- [ ] Deliberately seed edge cases: programs below benchmark, missing outcomes, missing verification, licensure failures, strong/weak programs, unknown outcomes, duplicate-student candidates

---

## Phase 2 (after MVP checkpoint above)

Per spec §63: Licensure workflow and dashboard, Accreditation readiness dashboard, Historical trend reporting, Improvement plans, Employer relationship analytics, Administrative dashboards (Executive, Program Health, Data Quality), Excel exports, advanced drill-down reports (Time-to-Employment, Placement Quality, Outcome Funnel, Unknown Outcome, Follow-Up Effectiveness, Employer Concentration/Pipeline), survey system (Graduate + Employer), Duplicate student merge UI polish, bulk verification/follow-up actions, saved import mapping profiles, Unified Student Communication Timeline.

## Phase 3

Per spec §64: Skills-gap analysis, Geographic placement reporting (Leaflet), custom Report Builder, Scheduled reports, advanced workflow automation, additional accreditation frameworks beyond COE, SIS/API integrations.

## Not yet scheduled (explicitly deferred, not forgotten)

- `RuleSet.rule_definition` internal schema design — blocked on COE documentation review, tracked in `docs/DATA_MODEL.md` §13.
- CI pipeline (GitHub Actions) — add once there's a meaningful test suite to run.
- Deployment target for the public portfolio instance.
