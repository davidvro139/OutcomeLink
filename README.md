# OutcomeLink

An accreditation and student-outcomes platform for career and technical colleges. It tracks students,
enrollments, employment, licensure and follow-up, computes the Council on Occupational Education (COE)
Completion, Placement and Licensure (CPL) rates, and produces the reports and exports used for
accreditation. The full requirements are in [OutcomeLink_Project_Specification.md](OutcomeLink_Project_Specification.md);
what has been built, and what is still open, is in [docs/TODO.md](docs/TODO.md).

## What's in the repository

| Folder | What it is |
| --- | --- |
| `server/` | The API: Express, Prisma and MySQL, with the accreditation engine and background jobs |
| `client/` | The web app: React, Mantine and TanStack Query |
| `shared/` | TypeScript types and constants used by both (roles, report fields, job types…) |
| `docker/` | Dockerfiles and the nginx configuration used by `docker-compose.yml` |
| `docs/` | Data model, tech stack, the COE rule matrix, and the running TODO |

It is an npm workspace, so one `npm install` at the root sets up everything.

## Running it locally

You need **Node.js 24** and **MySQL 8**.

```bash
npm install

# 1. Create two empty databases in MySQL: `outcomelink` (development) and `outcomelink_test` (tests).
# 2. Configure the server.
cp server/.env.example server/.env            # then set DATABASE_URL and the secrets
cp server/.env.test.example server/.env.test  # DATABASE_URL must point at outcomelink_test

# 3. Build the shared package, create the tables, and load demo data.
npm run build:shared
cd server
npx prisma migrate deploy
npm run prisma:seed          # a demo college: "Mountain West Technical College"
cd ..

# 4. Start both halves (two terminals).
npm run dev:server           # API on http://localhost:4000
npm run dev:client           # web app on http://localhost:5173
```

Sign in with `sam@mwtc.edu` / `password123` (System Administrator; `ada@mwtc.edu` is the Institutional
Administrator). The login page lists the other demo accounts in development. **The seed deletes everything in the database it points at**, so never run it against
data you want to keep.

After you change something in `shared/`, run `npm run build:shared` again; if the running web app then misbehaves,
restart it with `npm run dev:client -- --force`.

## Checks

```bash
npm run lint
npm run typecheck                          # all workspaces
npm test --workspace client                # web app tests
npm test --workspace server                # server unit tests
npm run test:integration --workspace server  # integration tests; resets the outcomelink_test database
npm run e2e --workspace client             # Cypress smoke test; needs both dev servers running
```

The same lint, typecheck and test steps run on every push and pull request (`.github/workflows/ci.yml`), along
with a build-and-smoke-test of the Docker deployment below.

## Configuration

The server reads `server/.env`. The Docker setup takes the same values from the root `.env`
(see `.env.docker.example`).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string. Required. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Sign login tokens. Required; long random values in production. |
| `SECRETS_ENCRYPTION_KEY` | Encrypts stored connection secrets (the SIS/Dataverse client secret). Required. |
| `CLIENT_ORIGIN` | Address the web app is served from (CORS). |
| `PUBLIC_APP_URL` | Base address used in emailed links. Defaults to `CLIENT_ORIGIN`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Outgoing email. Email is on only when `SMTP_HOST` and `MAIL_FROM` are both set; otherwise invitations and surveys show a link to copy. |
| `TRUST_PROXY` | Number of reverse proxies in front of the API (0 if none). Needed for correct per-address rate limiting behind a proxy. |
| `ALLOW_REGISTRATION` | Whether anyone can create a new institution through the API. On in development, **off in production** unless set. |
| `BACKUP_CHECKIN_TOKEN`, `BACKUP_STALE_HOURS` | Lets a backup job report its result to the app (see Backups below). Off when the token is unset. A backup with no success in `BACKUP_STALE_HOURS` (36) is flagged. |
| `UPLOADS_DIR` | Where evidence, import files and generated reports are stored. Defaults to `./uploads`. |
| `PORT` | API port (4000). |

## Deploying with Docker

`docker-compose.yml` runs three containers: MySQL, the API, and nginx, which serves the web app and forwards
`/api` to the API so the browser only ever talks to one address.

```bash
cp .env.docker.example .env      # fill in the passwords and secrets; see the comments in the file
docker compose up -d --build

# Create the first institution and its System Administrator (self-service registration is off in production):
docker compose exec api node dist/scripts/bootstrapAdmin.js \
  --institution "Your College" --name "Your Name" --email you@college.edu --password '<a long password>'
```

Then open `http://localhost:8080` and sign in. Add the rest of the staff from **Users → Invite User**.

**Before real use:**

- **HTTPS.** Put a TLS-terminating proxy or load balancer in front of the web container and set `PUBLIC_URL` to the
  `https://` address. Production sign-in cookies are marked `Secure`, so the app will not stay signed in over plain
  HTTP except on `localhost`.
- **Back up two things:** the MySQL data (`docker compose exec db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" outcomelink' > backup.sql`)
  and the `uploads` volume, which holds evidence documents and generated exports. Also keep a copy of your `.env`:
  without the same `SECRETS_ENCRYPTION_KEY` the stored connection secrets cannot be read.
- **One API instance.** Scheduled reports, nightly validation and the retry sweep run inside the API process, and the
  rate-limit counters are kept in its memory. Run a single instance; scaling out needs a shared store for the rate
  limits and a single scheduler.
- **Migrations** are applied automatically each time the API container starts.
- **Email** is optional. A System Administrator can enter each institution's SMTP settings in **Settings → Email**
  (with a test-send button); the `SMTP_*` and `MAIL_FROM` values in `.env` are the fallback for an institution that
  hasn't set its own. Job History → Email log shows what was sent.
- **Settings** (admin sidebar) also holds **Data retention** — how long job history, the email log, read notifications
  and generated export files are kept before the nightly cleanup removes them — and **Backups**, described next.
- **Backup status.** The app does not take backups. Run a scheduled `mysqldump` (plus a copy of the `uploads` volume) at
  the server level, set `BACKUP_CHECKIN_TOKEN`, and have the backup job report to the app so Settings → Backups shows
  the last successful backup and System Administrators are notified if it goes stale:

  ```bash
  report() {  # usage: report SUCCESS|FAILED "note"
    curl -fsS -X POST https://YOUR-APP/api/system/backup-checkin \
      -H "Authorization: Bearer $BACKUP_CHECKIN_TOKEN" -H 'Content-Type: application/json' \
      -d "{\"status\":\"$1\",\"note\":\"$2\"}"
  }
  if docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" outcomelink' > "backup-$(date +%F).sql"; then
    report SUCCESS "nightly dump"
  else
    report FAILED "mysqldump failed"
  fi
  ```

## Where to look next

- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — the database design
- [docs/TECH_STACK.md](docs/TECH_STACK.md) — technology choices and why
- [docs/COE_RULE_MATRIX.md](docs/COE_RULE_MATRIX.md) — how each COE classification is decided
- [docs/TODO.md](docs/TODO.md) — the build log, decisions and remaining work
