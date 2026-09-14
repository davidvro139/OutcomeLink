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

- [x] **Obtain and read official COE CPL documentation for the target reporting year before writing any rule logic** (spec §67) — read the current (Revised October 2025) Annual Report Help Manual plus the 2024 edition for worksheet detail not extractable as text in the current PDF; both cited in `docs/COE_RULE_MATRIX.md`. The Handbook of Accreditation itself is still unread — flagged as an open question there, to revisit before the Validation Engine/Improvement Plans work
- [x] Build the documented rule matrix: COE definition → classification → numerator behavior → denominator behavior → exclusion behavior → validation rules → automated tests — `docs/COE_RULE_MATRIX.md`. Caught and corrected a wrong guess already sitting in `docs/DATA_MODEL.md` §13 (continuing education is actually *related placement*, i.e. counts in the Placement numerator — not a Placement exclusion as an earlier draft assumed)
- [x] AccreditationFramework / RuleSet / ReportingPeriod CRUD (admin configuration) — `server/src/modules/accreditation/frameworks/`, `rules/`, `reportingPeriods.ts`. `RuleSet.ruleDefinition` stores only the benchmark percentages (60/70/70) as data; the classification/calculation algorithm itself is versioned, tested code (`classifiers/coe2026.ts`) rather than a generic rule-interpreter DSL — deferred per `docs/DATA_MODEL.md` §13 until a second framework actually needs one
- [x] Classifier interface + COE-2026 implementation, driven by the rule matrix — one classification per (student enrollment, reporting period, metric) per `docs/DATA_MODEL.md` — `server/src/modules/accreditation/classifiers/coe2026.ts`, pure and DB-free by design
- [x] Calculator interface for Completion / Placement / Licensure + unit tests — `server/src/modules/accreditation/calculators/cplCalculator.ts` orchestrates the classifier over every enrollment and aggregates per-program and institution-wide `CplCalculationResult` rows. 25 unit tests on the classifier itself (`coe2026.test.ts`), covering every classification branch and the two order-of-precedence rules (unavailable/refused checked before employment; already-employed-related checked before awaiting-licensure). Note: COE's own sample worksheet numbers in the Annual Report Help Manual couldn't be reliably reconstructed from the PDF text extraction (rows 12+ came out misaligned) — tests use self-constructed scenarios built directly from the verbatim rule definitions instead of risking wrong "official" numbers as ground truth
- [x] Explanation generator backing "How This Student Counts" (`CplCalculationExplanation`) — the classifier produces `reasonText` directly (it's the only thing that knows why), persisted 1:1 with each `StudentClassification`, including for `NOT_APPLICABLE` cases, so a student always has an answer for "why don't I count here"
- [ ] Validation engine: ERROR/WARNING/INFORMATION checks from spec §22 — not started
- [ ] Reporting Period finalize/reopen workflow (spec §25) — not started; periods currently stay `OPEN` indefinitely and can be recomputed any number of times
- [ ] Duplicate Student Resolution merge workflow (spec §23) — not started

**Checkpoint reached:** verified end-to-end against the live database and over HTTP — created a framework/rule set/reporting period, ran nine hand-computed scenarios (covering every classification branch) through `computeReportingPeriod`, got exactly the expected numerator/denominator/percentage at both program and institution level, confirmed re-running is idempotent (no duplicate rows), then repeated a smaller version purely through the HTTP API (framework → rule set → reporting period → outcome record → compute → results → drill-down → per-student explanation) and got correct results there too.

**Follow-ups (not yet done):** the three unchecked items above (Validation Engine, finalize/reopen, duplicate merge) are real gaps, not oversights — stage 4's core "records → classifications → calculations → explanations" pipeline was the priority and is now proven end-to-end; these three are next. Also: `computeReportingPeriod` always recomputes every enrollment from scratch (no incremental/partial recomputation), and there's no protection yet against recomputing a period that's supposed to be locked — that's exactly what the finalize/reopen workflow needs to add.

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
