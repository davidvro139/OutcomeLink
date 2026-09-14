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

- [ ] Express + TypeScript app scaffold, module folders per spec §58
- [ ] API conventions from `docs/TECH_STACK.md`/spec §59: response envelope, pagination params, standard error shape
- [ ] Zod request-validation middleware
- [ ] Auth: register/login, JWT access token + httpOnly refresh cookie, bcrypt password hashing
- [ ] Role-based authorization middleware, including program-level and campus-level scoping (`UserProgramAccess`, `UserCampusAccess`)
- [ ] Generic audit-log service (`AuditLogEntry` writer) wired as middleware/hook so it's used automatically, not bolted on per-entity later
- [x] Health-check endpoint + basic request logging (pino) — done in stage 0

**Checkpoint:** can register a user, log in, and hit an authenticated "who am I" endpoint with roles enforced.

## 3. Core CRUD (non-accreditation)

- [ ] Institution / Campus / Department / Program
- [ ] Student, StudentCommunicationPreference, StudentEnrollment
- [ ] Employer, EmployerContact
- [ ] EmploymentRecord (historical, never overwritten — spec §8)
- [ ] FollowUpAttempt + Follow-Up Queue endpoint (filters: program, campus, staff, outcome status, days overdue, attempts, reporting period)
- [ ] Evidence upload endpoint (multer, local storage adapter)

**Checkpoint:** can create a program, enroll a student, log employment, record a follow-up attempt, and attach evidence — all through the API.

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
