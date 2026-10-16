# Mini RFQ Portal

A web application where a **buyer** publishes Requests for Quotation (RFQs), **vendors** submit and revise priced quotations before the deadline, and the buyer **compares** the offers and **awards** one vendor. **Admins** manage users and can see everything.

Built for the Bidveda Backend/Full-Stack Lead Developer assignment.

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, React Router, Tailwind CSS, React Hook Form + Zod |
| Backend | Node.js 22, Express 5, TypeScript, Zod, bcryptjs, JWT in HttpOnly cookies, multer, Swagger UI |
| Database | MySQL 8, Prisma ORM (migrations and seed) |
| Run | Docker Compose: `db`, `api`, `web` (nginx) |

Documents:
- [`docs/system-design.md`](docs/system-design.md): the ten-section design document
- [`docs/test-cases.md`](docs/test-cases.md): test register, with executed and manual status
- [`docs/walkthrough-script.md`](docs/walkthrough-script.md): the 5–10 minute demo plan
- API documentation: start the app and open **http://localhost:8080/api/docs** (Swagger UI), or read `/api/v1/openapi.json`

---

## 1. Run it locally

You need Node.js 22 or newer, npm 10 or newer, and a running MySQL 8.

**a. Create the databases and user** (in a MySQL shell as root):

```sql
CREATE DATABASE rfq_dev  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE rfq_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rfq'@'localhost' IDENTIFIED BY 'change_me_db_password';
GRANT ALL PRIVILEGES ON rfq_dev.*  TO 'rfq'@'localhost';
GRANT ALL PRIVILEGES ON rfq_test.* TO 'rfq'@'localhost';
```

**b. Configure and install:**

```bash
cp .env.example .env          # fill in DATABASE_URL, TEST_DATABASE_URL, JWT_SECRET, ADMIN_INVITE_CODE
npm install                   # installs both workspaces and generates the Prisma client
```

**c. Migrate and seed:**

```bash
npm run db:migrate            # applies migrations to DATABASE_URL (prisma migrate deploy)
npm run db:seed               # demo data; safe to run again
```

**d. Start the API and the web app** (two terminals):

```bash
npm run dev:backend           # API on http://localhost:4000 (Swagger at /api/docs)
npm run dev:frontend          # web app on http://localhost:5173 (proxies /api to :4000)
```

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | MySQL connection URL for the app and seed |
| `TEST_DATABASE_URL` | for tests | — | Test database. **Its name must end in `_test`**; the suite refuses to run otherwise |
| `JWT_SECRET` | yes | — | Signs session tokens. At least 32 characters |
| `JWT_EXPIRES_IN` | no | `8h` | Session length |
| `ADMIN_INVITE_CODE` | no | empty | Needed to create an ADMIN through `/auth/register`. Empty disables admin self-registration |
| `COOKIE_SECURE` | no | `false` | Set `true` when served over HTTPS |
| `UPLOAD_DIR` | no | `./uploads` | Where PDF/XLSX files are stored. Keep it outside any public web directory |
| `MAX_UPLOAD_MB` | no | `10` | Per-file upload limit |
| `CLOSURE_SWEEP_INTERVAL_MS` | no | `60000` | How often expired RFQs are closed in the background. `0` disables the timer |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Allowed browser origin for direct API calls |
| `PORT` | no | `4000` | API port |
| `SEED_DEMO_DATA` | no | `false` | Docker only: load demo data on start |
| `WEB_PORT` | no | `8080` | Docker only: host port for the web app |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | Docker | — | MySQL container settings. Use letters and digits in the password |

---

## 2. Database migrations

Migrations live in `backend/prisma/migrations`. Apply them with `npm run db:migrate` (locally) or automatically on API start (Docker).

When you change `backend/prisma/schema.prisma`, create a migration on a development database:

```bash
cd backend && npx prisma migrate dev --name describe_change
```

**Drift check.** The first migration was written by hand to match Prisma's MySQL mapping, because the environment used to build this repository could not download Prisma's schema engine. Confirm that the migrations and the schema agree:

```bash
cd backend
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "mysql://rfq:change_me_db_password@127.0.0.1:3306/rfq_shadow" \
  --exit-code
```

Exit code `0` means no drift. Create an empty `rfq_shadow` database first, with the same grants as the other databases.

**Reset a development database** (deletes its data):

```bash
cd backend && npx prisma migrate reset --force   # drops, re-applies all migrations, runs the seed
```

Do not run reset against a database that contains data you need.

---

## 3. Tests

```bash
npm test                        # backend integration tests + frontend tests
npm test -w backend             # only backend (needs MySQL and TEST_DATABASE_URL)
npm test -w frontend            # only frontend
node scripts/e2e-check.mjs      # end-to-end workflow against the running API (uses real time, about 60 s)
```

The backend suite resets its own `_test` database before every run by applying the migration SQL, so it never touches demo or production data. It runs 51 tests across authentication, RFQ lifecycle, quotations and deadlines, comparison, award (including a concurrent double-award), file handling, and money arithmetic.

Frontend tests use Vitest and Testing Library, and cover form validation, server error mapping, INR and IST formatting, and money preview arithmetic.

The e2e script follows the assignment example with a real 45-second deadline. Start the API and seed first. It must be able to log in with the demo accounts.

Typecheck everything with `npm run typecheck`. Build with `npm run build`.

---

Important design points (full detail in `docs/system-design.md`):
- **Server decides every outcome.** Totals, deadlines, visibility and award eligibility are computed and checked in the service layer. The UI only shapes what a user sees.
- **Deadline is authoritative on the server.** A quotation is accepted only while `now < deadline`. The check runs inside the same transaction as the write, and the clock is injectable so tests can check the exact boundary.
- **Money is decimal.** `DECIMAL(16,2)` in MySQL, decimal.js arithmetic on the server, two-decimal strings in the API. The browser shows a preview only.
- **Revisions are immutable.** Each save appends a revision with its own line-item snapshot. Comparison and award use the latest one.
- **Award is atomic.** One transaction. A conditional update moves the RFQ from CLOSED to AWARDED, so concurrent awards cannot both succeed.
- **Status history is transactional.** Each history row is written with the change it describes.
- **Files are validated by content.** Extension, MIME type and file signature are all checked. Files are stored under generated names outside any web root, and every download is authorized.

Repository layout:

```
backend/
  prisma/            schema.prisma, migrations/, seed.ts
  src/
    routes/          HTTP routers
    services/        business logic and transactions
    middleware/      auth, role checks, uploads, error handling
    validation/      Zod schemas
    docs/            OpenAPI document
    app.ts           Express factory;  server.ts  entrypoint
  tests/             Vitest + Supertest integration suites
frontend/
  src/
    pages/           buyer, vendor, rfq, admin, auth screens
    components/      layout, guards, UI primitives, file upload
    api/             typed fetch client and DTOs
    lib/             formatting (INR, IST), money preview, errors
docs/                system design, test register, walkthrough script
scripts/e2e-check.mjs
docker/              API entrypoint (migrate, optional seed, start)
docker-compose.yml   one-command stack
```

---

## 4. Known limitations and next steps

Being precise about what is incomplete:

- **Not run in a real browser.** The build environment had no browser. UI behaviour is covered by component tests and by exercising the same flows through the live API. A manual pass is listed in `docs/test-cases.md` (MN-01 to MN-03).
- **Docker not run in the build environment.** The Dockerfiles, compose file and nginx configuration are written and reviewed, but the one-command start has not been executed in this repository's build sandbox. Run `docker compose up --build` once and check http://localhost:8080 before submitting. Please treat this as unverified until you have.
- **Migration written by hand.** See section 3 for the drift check. Run it before relying on the migrations.
- **Background sweeper not timed on its own.** Closure is verified through the request path and the same function the sweeper calls. The interval timer itself is covered by a manual check (MN-06).
- **Audit log is partial.** The required status history is implemented. The optional general audit log (who changed what, for user and file events) is not.
- **File scanning.** Uploads are validated by extension, MIME type and file signature. There is no antivirus or malware scanning. XLSX validation checks the ZIP container and OOXML markers, not every internal part.
- **Storage is local.** Files live on a Docker volume. For more than one host, move to object storage with signed download URLs.
- **Auth gaps.** No password reset, no email verification, no CSRF token (mitigated by SameSite=Strict cookies and JSON-only mutations), and no session revocation before the token expires. Login is rate-limited per process, in memory.
- **Single currency and timezone.** INR only, deadlines entered in IST (+05:30).
- **No notifications.** Vendors and buyers are not emailed about deadlines or awards.
- **Scale.** The design identifies what breaks first at about 100 times the load (`docs/system-design.md` §10). The next steps are keyset pagination and a search index, object storage, a single scheduled sweeper, and a shared rate-limit store.

Priority order for the next release: verify Docker and the browser flows; object storage with malware scanning; keyset pagination and search; the general audit log; notifications and password reset.

---

## 5. Troubleshooting

- **`Invalid configuration: JWT_SECRET must be at least 32 characters`.** Set a longer secret in `.env`.
- **`Refusing to run tests against "…". The database name must end in _test`.** Point `TEST_DATABASE_URL` at a database whose name ends in `_test`.
- **`Access denied` from MySQL.** Check the user, password and grants in section 2a. In `DATABASE_URL`, special characters in the password must be URL-encoded.
- **`prisma` cannot find the client.** Run `npm install` at the repository root. It runs `prisma generate` in the backend workspace. You can also run `npm run prisma:generate -w backend`.
- **Login works but then every request is 401.** Your session cookie is not being sent. Use the web app origin (`http://localhost:5173` or `:8080`) rather than opening the API port directly. Check `COOKIE_SECURE` is `false` over plain HTTP.
- **Upload says "not a valid PDF" for a PDF you think is valid.** The server checks the file starts with `%PDF-`. Some tools add bytes before the header; re-export the PDF.

---