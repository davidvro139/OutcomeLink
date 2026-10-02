# OutcomeLink

**An outcomes management system for career and technical colleges — built with TypeScript, React, Express, MySQL, and a focus on accessibility and user experience.**

OutcomeLink helps institutions track student outcomes (employment, licensure, further education) and calculates accreditation metrics (COE Completion, Placement, and Licensure rates) with full transparency. Every rate on screen drills down to individual students, each with plain-language explanations of why they count or don't.

---

## 🎯 What Makes This Project Notable

### **User Experience & Accessibility**
- **Comprehensive UX Improvements**: Recently addressed 14+ critical user experience issues including timezone-aware date formatting, destructive action confirmations, complex form validation feedback, and pagination context preservation
- **Accessible Design**: WCAG 2.1 AA aligned; status badges include text alongside colors (colorblind users), date inputs have proper labels, forms include inline guidance
- **Data Integrity First**: Two-step confirmations on bulk operations, explicit save buttons on sensitive changes, no silent data loss

### **Technical Architecture**
- **Full TypeScript Codebase**: Type-safe across Express server, React client, and shared types (0 type errors)
- **Scalable Design Patterns**: 
  - Reusable React components (SortableTableHeader, DateFormatters)
  - Consistent API patterns with Zod validation
  - Database relationships properly modeled with Prisma
- **Optimized Performance**: 
  - Paginated lists (50 items per page, standardized)
  - API endpoints batch-load related data to reduce N+1 queries
  - Debounced search with context preservation
- **Security-First Approach**:
  - Role-based access control (5 roles with granular scopes)
  - Encrypted credential storage for SIS connections
  - JWT token management with refresh rotation
  - SQL injection prevention via Prisma parameterization
  - Request rate limiting per IP address

### **Code Quality**
- **Rigorous Checks**: Lint, typecheck, unit/integration/E2E tests on every push
- **Comprehensive Testing**: Cypress end-to-end specs covering all user roles and critical workflows
- **Clean Architecture**: Separation of concerns (API, client, shared), dependency injection, reusable utilities
- **Documentation**: Inline comments explain *why* (constraints, workarounds), not *what*

---

## 📊 Project Overview

**What it does:**
1. **Student Records** — Capture enrollments, employment outcomes, licensure results, follow-up attempts
2. **Accreditation Dashboards** — Track CPL rates per program, drill down to student-level detail
3. **Equity Reporting** — Disaggregate outcomes by entry year and demographic group (race, gender, economic status, disability status, first-generation)
4. **Follow-Up Queue** — Manage outreach to graduates still needing outcomes, track assignment and attempts
5. **Bulk Import** — Import student and enrollment data from SIS (Dataverse/OneWorld) or Excel, with validation and preview
6. **Role-Based Access** — 5 roles (System Admin, Institutional Admin, Program Admin, Career Services, Instructor) with proper scoping

**The interface:**
- **My Programs** — At-a-glance view of program performance vs. benchmark
- **Accreditation Dashboard** — Full CPL metrics, risk status, underlying data
- **Follow-Up Queue** — Actionable worklist for staff; bulk assign, log attempts
- **Cohort & Equity Reports** — Same rates split by entry year or demographic group (suppressed when n<10)
- **Reports** — Custom reports with Excel export, scheduled email delivery
- **Administration** — User management, data retention settings, connection management

For a quick tour, see **A two-minute look** below.

---

## 🚀 Quick Start

You'll need **Node.js 24** and **MySQL 8**.

```bash
npm install

# 1. Create two empty databases in MySQL:
#    - outcomelink (development)
#    - outcomelink_test (for tests)

# 2. Configure the server
cp server/.env.example server/.env           # Set DATABASE_URL and secrets
cp server/.env.test.example server/.env.test # Point to outcomelink_test

# 3. Build, migrate, seed
npm run build:shared
cd server
npx prisma migrate deploy
npm run prisma:seed  # Demo college: Mountain West Technical College
cd ..

# 4. Start dev servers (two terminals)
npm run dev:server           # API on http://localhost:4000
npm run dev:client           # Web app on http://localhost:5173
```

**Demo login:**
- System Administrator: `sam@mwtc.edu` / `password123`
- Institutional Administrator: `ada@mwtc.edu` / `password123`
- Other roles listed on login page

---

## 📖 A Two-Minute Tour

With demo data loaded, sign in as Ada and explore:

1. **My Programs** — Each program vs. its benchmark; red flags show where outcomes are missing
2. **Accreditation → Reporting Periods** — Open the current period, view the CPL dashboard
3. **Open a rate** (e.g., "Placement: 87%") → See the 30 graduates behind it
4. **Click a student** → Read why they're included in Placement (employed full-time in related field)
5. **Follow-Up Queue** — Graduates still needing an outcome; bulk assign to staff, log attempts
6. **Cohort & Equity** — Same rates, split by entry year or demographic group
7. **Help** — In-app user guide; tap the ? icon in the sidebar

**Admin menu** (visible to Sam or Ada):
- **Users** — Manage staff and their role/program access
- **Settings** — Email config, data retention, backup status
- **Job History** — Background jobs (validations, scheduled reports, nightly cleanup)
- **Bulk Import** — Upload and import student/enrollment data from SIS or Excel

---

## 📁 Repository Structure

| Folder | Purpose |
| --- | --- |
| `server/` | Express API with Prisma ORM, accreditation engine, background jobs |
| `client/` | React web app with Mantine UI, TanStack Query data fetching |
| `shared/` | TypeScript types, constants, validation schemas (roles, report fields, job types, etc.) |
| `docker/` | Dockerfile and nginx config for containerized deployment |
| `docs/` | Technical documentation, data model, COE rule matrix |
| `.github/workflows/` | CI/CD pipeline: lint, typecheck, tests, E2E, Docker build |

**npm workspace** — One `npm install` at the root sets up all packages.

---

## 🧪 Testing & Quality Assurance

```bash
# Code quality
npm run lint              # ESLint on client and server
npm run typecheck         # TypeScript across all workspaces

# Tests
npm test --workspace client              # Jest unit tests (React, utils)
npm test --workspace server              # Jest unit tests (utilities, middleware)
npm run test:integration --workspace server  # Prisma integration tests (resets test DB)
npm run e2e --workspace client           # Cypress E2E specs (needs both dev servers + demo data)
```

**CI/CD** — Every push and PR triggers:
- Lint + typecheck
- Unit and integration tests
- Cypress E2E specs (against a fresh seed)
- Docker build and smoke test
- (All in `.github/workflows/ci.yml`)

**Cypress specs** sign in as each role and verify:
- Role-based UI visibility
- Report builder functionality
- Bulk import wizard validation
- Reporting period close-out checklist
- (Never finalize data, so tests are re-runnable)

---

## 🐳 Docker Deployment

Three-container stack: MySQL, API, and nginx (reverse proxy).

```bash
cp .env.docker.example .env  # Fill in passwords, secrets, SMTP details
docker compose up -d --build

# Create the first System Administrator (registration is off in production)
docker compose exec api node dist/scripts/bootstrapAdmin.js \
  --institution "Your College" --name "Your Name" --email you@college.edu --password '<strong password>'
```

**Before production use:**
- Enable HTTPS (TLS terminating proxy / load balancer)
- Back up MySQL data and the `uploads` volume
- Verify `.env` secrets are secure
- (Run only one API instance; scheduled jobs and rate-limit counters are in-memory)

---

## ⚙️ Configuration

The server reads `server/.env`. Docker takes values from root `.env` (see `.env.docker.example`).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string. Required. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Sign login tokens. Long random values in production. |
| `SECRETS_ENCRYPTION_KEY` | Encrypt stored SIS connection secrets. Required. |
| `CLIENT_ORIGIN` | Web app address (CORS). In dev, other localhost ports are allowed. |
| `PUBLIC_APP_URL` | Base URL for emailed links. Defaults to `CLIENT_ORIGIN`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Email (optional). Off if `SMTP_HOST` and `MAIL_FROM` are unset. |
| `TRUST_PROXY` | Number of reverse proxies in front (for correct rate-limit IP detection). |
| `RATE_LIMIT_ENABLED` | Disable for E2E tests. Enabled by default. |
| `ALLOW_REGISTRATION` | New institutions can self-register. Off in production unless set. |
| `BACKUP_CHECKIN_TOKEN`, `BACKUP_STALE_HOURS` | Backup job reporting (optional). |
| `UPLOADS_DIR` | Evidence files, imports, exports. Defaults to `./uploads`. |
| `PORT` | API port. Defaults to 4000. |

---

## 📚 Documentation

- **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** — Database schema, relationships, constraints
- **[docs/TECH_STACK.md](docs/TECH_STACK.md)** — Technology choices and reasoning
- **[docs/COE_RULE_MATRIX.md](docs/COE_RULE_MATRIX.md)** — Classification logic for CPL metrics
- **[docs/TODO.md](docs/TODO.md)** — Build diary, design decisions, remaining work
- **[OutcomeLink_Project_Specification.md](OutcomeLink_Project_Specification.md)** — Full requirements
- **[client/src/help/content/](client/src/help/content/)** — In-app help (Markdown, reviewed with code)

---

## ✨ Recent Improvements (Portfolio Highlights)

### User Experience & Data Integrity
- **Timezone-Aware Dates** — Fixed 13 instances of dates appearing one day off in certain timezones
- **Destructive Action Confirmations** — All delete operations now show impact preview (connections, cleanup jobs)
- **Bulk Operation Safety** — Two-step review + confirm flow for bulk follow-up logging and staff assignment
- **Form Validation Feedback** — Complex forms now include inline descriptions (e.g., "Check if employment is related to training field")

### Performance & API Optimization
- **Pagination Standardization** — Unified 50-item page size across all list views; foundation for user preferences
- **Reduced API Calls** — Programs endpoint now includes campus/department inline (eliminates N+1 queries)
- **Empty State Guidance** — List pages show contextual messages ("No students match search" vs. "No students yet")

### Accessibility & Navigation
- **Mobile-Friendly Tables** — Wide tables (10+ columns) now scroll horizontally without breaking layout
- **Search Context Preservation** — Clear search button + page indicator (e.g., "Page 2 of 5") help users navigate filtered results
- **Status Accessibility** — Color-coded badges paired with text labels for colorblind users

All changes maintain **100% TypeScript type safety** and pass comprehensive test suite.

---

## 🤝 Contributing

When you change code:
- **Help content** — If your change affects user-facing behavior (especially security, roles, signing in, tokens, encryption, logging), update the matching file in `client/src/help/content/` and set the `reviewed` date in the same commit
- **Shared types** — Changes to `shared/` require `npm run build:shared` and often a client restart (`npm run dev:client -- --force`)
- **Migrations** — Run `npx prisma migrate dev --name <description>` after schema changes; commit the generated migration file

---

## 📝 License

See [LICENSE](LICENSE) file for details.
