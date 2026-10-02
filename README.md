# OutcomeLink

**An outcomes management system for career and technical colleges built with TypeScript, React, Express, and MySQL.**

OutcomeLink tracks student outcomes (employment, licensure, continuing education) and calculates Council on Occupational Education (COE) Completion, Placement, and Licensure (CPL) rates for accreditation reporting. Every rate drills down to individual students with plain-language explanations of why each student is counted or excluded.

---

## Overview

### Core Capabilities

**Student Outcomes Tracking**
- Enrollment management (program, campus, start/end dates, status)
- Employment outcome recording with job title, employer, related training indicator
- Licensure exam results and scheduling
- Continuing education tracking
- Follow-up attempts and outcomes

**Accreditation Metrics**
- Completion, Placement, and Licensure rate calculation
- Configurable COE rule sets with negotiated benchmarks per program
- Reporting period management and closeout workflows
- Risk status indicators for rates trending below target

**Equity and Cohort Analysis**
- Outcomes disaggregated by entry year and demographic group
- Groups under 10 students suppressed to protect privacy
- Trend analysis across six-period windows
- Coverage metrics showing percentage of population with demographic data

**Administrative Functions**
- Multi-institution support with institution-scoped data
- 5-level role-based access control (System Admin, Institutional Admin, Program Admin, Career Services, Instructor, Read-Only Auditor)
- User management and program assignment
- Bulk data import from SIS (Dataverse/OneWorld) or Excel with validation and preview
- Scheduled report delivery via email
- Evidence document collection and linking

---

## Technology Stack

**Backend**
- **Node.js 24** with Express for HTTP API
- **Prisma ORM** for type-safe database access
- **MySQL 8** for persistent data
- **Zod** for schema validation and security
- **JWT** for stateless authentication with refresh rotation
- **Winston** for structured logging

**Frontend**
- **React 19** with hooks and context for state management
- **TanStack Query** for server state and caching
- **Mantine UI** for component library (accessible, consistent design)
- **TypeScript** for compile-time type safety
- **Vite** for fast development and optimized builds

**Testing & Quality**
- **Jest** for unit and integration tests
- **Cypress** for end-to-end browser testing
- **ESLint** and **TypeScript** for linting and type checking
- **GitHub Actions** for CI/CD automation

**Deployment**
- **Docker** for containerization
- **Docker Compose** for local development and simple production deployments
- **nginx** as reverse proxy

---

## Quick Start

**Requirements:** Node.js 24, MySQL 8

```bash
npm install

# Set up databases
# CREATE DATABASE outcomelink;           -- development
# CREATE DATABASE outcomelink_test;     -- tests

cp server/.env.example server/.env
cp server/.env.test.example server/.env.test
# Edit both files to set DATABASE_URL and required secrets

npm run build:shared
cd server
npx prisma migrate deploy
npm run prisma:seed
cd ..

npm run dev:server    # API on http://localhost:4000
npm run dev:client    # Web on http://localhost:5173
```

**Demo credentials:**
- System Admin: `sam@mwtc.edu` / `password123`
- Institutional Admin: `ada@mwtc.edu` / `password123`

---

## Project Structure

| Directory | Purpose |
| --- | --- |
| `server/` | Express API, Prisma schema, background jobs, business logic |
| `client/` | React application, UI components, data fetching |
| `shared/` | TypeScript types, constants, validation schemas |
| `docker/` | Containerization configuration |
| `docs/` | Technical documentation and design decisions |

---

## Testing & Quality Assurance

```bash
npm run lint                          # ESLint
npm run typecheck                     # TypeScript
npm test --workspace client           # Unit tests
npm test --workspace server           # Unit tests
npm run test:integration --workspace server  # Integration tests
npm run e2e --workspace client        # Cypress E2E
```

All checks run automatically on pull requests and merges via GitHub Actions.

---

## Docker Deployment

```bash
cp .env.docker.example .env
docker compose up -d --build

docker compose exec api node dist/scripts/bootstrapAdmin.js \
  --institution "College Name" --name "Admin Name" --email admin@college.edu --password '<password>'
```

Open `http://localhost:8080` to sign in.

**Production requirements:**
- HTTPS with TLS termination (set `PUBLIC_URL` to `https://` address)
- Backup strategy for MySQL data and `uploads` volume
- Single API instance (scheduled jobs and rate-limit counters are in-process)
- Email configuration (optional; can be set per-institution in Settings)

---

## Configuration

The server reads `server/.env`. Docker uses root `.env` (see `.env.docker.example`).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Login token signing keys |
| `SECRETS_ENCRYPTION_KEY` | Encrypt stored SIS connection credentials |
| `CLIENT_ORIGIN` | Web app address for CORS |
| `PUBLIC_APP_URL` | Base URL for email links (defaults to `CLIENT_ORIGIN`) |
| `SMTP_*`, `MAIL_FROM` | Email configuration (optional) |
| `TRUST_PROXY` | Reverse proxy count (for accurate rate-limit IP detection) |
| `RATE_LIMIT_ENABLED` | Request rate limiting (disable for E2E tests only) |
| `ALLOW_REGISTRATION` | Allow new institutions to self-register (off in production) |
| `BACKUP_CHECKIN_TOKEN`, `BACKUP_STALE_HOURS` | Backup job reporting (optional) |
| `UPLOADS_DIR` | File storage path for evidence and exports (default: `./uploads`) |
| `PORT` | API port (default: 4000) |

---

## Architecture & Design Decisions

### Data Model
- **Multi-tenant design** — Each institution has independent data, users, and configuration
- **Audit trail** — All data changes are logged for compliance and debugging
- **Soft deletes** — Data is marked deleted but retained for reporting consistency
- See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for schema details

### Security
- **Role-based access control** with program-level scoping
- **JWT tokens** with short-lived access and refresh rotation
- **Encrypted credential storage** for SIS connections (AES-256-GCM)
- **SQL injection prevention** via Prisma parameterization
- **Rate limiting** per IP address with configurable thresholds
- **CORS configuration** with configurable allowed origins
- **HTTPS-only cookies** in production

### API Design
- **RESTful endpoints** with standard HTTP methods and status codes
- **Paginated responses** with metadata (total count, page info)
- **Consistent error format** with descriptive messages
- **Request validation** via Zod schemas at all entry points
- **Idempotent operations** where possible (e.g., bulk imports)

### UI/UX
- **Accessible design** (WCAG 2.1 AA compliance)
- **Consistent component library** (Mantine) across all pages
- **Responsive layouts** that work on mobile, tablet, and desktop
- **Clear data visualization** with contextual help and documentation
- **Progressive enhancement** for long-running operations (bulk imports, report generation)

---

## Documentation

- **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** — Database schema and relationships
- **[docs/TECH_STACK.md](docs/TECH_STACK.md)** — Technology choices and trade-offs
- **[docs/COE_RULE_MATRIX.md](docs/COE_RULE_MATRIX.md)** — CPL classification logic
- **[docs/TODO.md](docs/TODO.md)** — Build log, design decisions, and roadmap
- **[OutcomeLink_Project_Specification.md](OutcomeLink_Project_Specification.md)** — Full functional specification
- **[client/src/help/content/](client/src/help/content/)** — In-app user documentation (Markdown)

---

## User Interface Tour

**Dashboard & Reports**
- **My Programs** — Program performance vs. benchmark with risk indicators
- **Accreditation** — Full CPL metrics with drill-down to student detail
- **Cohort & Equity** — Outcomes disaggregated by entry year and demographic group
- **Custom Reports** — Flexible reporting with export to Excel and scheduled delivery

**Operations**
- **Follow-Up Queue** — Actionable list of graduates needing outcomes with staff assignment and bulk operations
- **Students** — Student records, enrollment history, outcomes, and follow-up tracking
- **Bulk Import** — Upload and validate student/enrollment data with preview before commit

**Administration** (for System/Institutional Administrators)
- **Users** — Staff management with role and program assignment
- **Settings** — Email configuration, data retention policy, backup status
- **Job History** — Scheduled reports, nightly validations, background job logs
- **Connections** — SIS/Dataverse connection configuration for live data sync

---

## Contributing

**Code changes:**
- Run `npm run typecheck` and `npm run lint` before committing
- Ensure tests pass: `npm test`
- Update help documentation in `client/src/help/content/` if user-visible behavior changes
- Changes to `shared/` require `npm run build:shared` and often a client restart

**Database changes:**
- Use `npx prisma migrate dev --name <description>` to generate migrations
- Commit the generated migration file with your changes

**Documentation:**
- Update `docs/TODO.md` when design decisions change
- Keep security-related content in `client/src/help/content/security.md` accurate
- Add `reviewed` date stamps to help files after updates

---

## License

See [LICENSE](LICENSE) file for details.
