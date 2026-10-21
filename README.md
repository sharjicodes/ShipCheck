# ShipCheck

ShipCheck audits one submitted public web page for automated accessibility issues with Playwright and axe-core. It stores scans in PostgreSQL, runs them through a BullMQ queue backed by Redis, and shows scan status, findings, and recent history in the web app. It is a local development MVP and is not a WCAG certification or a service ready for unrestricted public deployment.

## Architecture

```mermaid
flowchart LR
  Browser[Next.js web app] -->|REST / polling| API[Fastify API]
  API --> DB[(PostgreSQL / Prisma)]
  API --> Queue[(Redis / BullMQ)]
  Queue --> Worker[Playwright worker]
  Worker -->|single page + axe-core| Site[Submitted public website]
  Worker --> DB
```

The API validates scan requests, stores a queued record, then adds a queue job. The worker loads the page in an isolated browser context, injects axe-core, stores a bounded set of findings, and updates the scan state. The browser uses a single page only; there is no site crawl.

## Requirements and setup

- Node.js 20.11 or newer (Node 22 recommended)
- npm 10 or newer
- Docker Desktop or Docker Engine with Compose

From the repository root:

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npx playwright install chromium
```

Run each process in its own terminal:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

Open <http://localhost:3000>. The API and worker development scripts load the root `.env`. The API binds to `127.0.0.1` by default and allows `http://localhost:3001` in development when port 3000 is occupied. Set `API_HOST=0.0.0.0` only when the API must be reached from another container; use an authenticated gateway and network controls for any shared environment.

## Environment

Copy `.env.example` to `.env` and configure:

| Variable | Purpose | Local default |
| --- | --- | --- |
| `DATABASE_URL` | Prisma PostgreSQL connection | `postgresql://shipcheck:shipcheck_dev_password@localhost:5432/shipcheck?schema=public` |
| `REDIS_URL` | BullMQ Redis connection | `redis://localhost:6379` |
| `SCAN_NAVIGATION_TIMEOUT_MS` | Worker page navigation timeout in milliseconds | `20000` |
| `API_PORT` | Fastify port | `4000` |
| `API_HOST` | Fastify bind address | `127.0.0.1` |
| `WEB_ORIGIN` | Comma-separated allowed browser origins | `http://localhost:3000,http://localhost:3001` |
| `NEXT_PUBLIC_API_URL` | API URL compiled into the frontend | `http://localhost:4000` |

The example credentials are for local development only. Use environment-specific secrets outside local development.

## Commands

```bash
npm run build          # Build all workspaces that define a build script
npm run typecheck      # Type-check all workspaces
npm run db:generate    # Generate Prisma Client
npm run db:migrate     # Apply/create local development migrations
npm run db:deploy      # Apply committed migrations in deployment
```

Run `npm test` for URL and request policy, API schema validation, status transition, axe result normalization, public failure-message, and PostgreSQL result persistence tests. The persistence test requires the local PostgreSQL service and uses only a temporary test row; the unit tests do not contact arbitrary websites.

## API

- `GET /health`: API, PostgreSQL, and Redis readiness
- `POST /api/scans` with `{ "url": "https://example.com" }`: validate, persist, and queue a scan; returns HTTP 202
- `GET /api/scans/:id`: retrieve scan state and saved results
- `GET /api/scans?page=1&limit=20&status=completed&hostname=example.com`: paginated recent history (limit 1–50)

Scan statuses are `queued`, `running`, `completed`, and `failed`. The UI polls scan status and stops when a terminal state is returned. The report distinguishes axe violations, passed rules, and incomplete checks; it does not claim complete WCAG coverage.

## Database

Prisma migrations are in `packages/db/prisma/migrations`. The schema stores the submitted URL, hostname, lifecycle timestamps, duration, status, a JSON summary, and normalized axe findings. Findings retain rule IDs, impact, descriptions, help links, tags, affected node count, and up to three text-rendered examples per rule. The worker stores at most 200 violating rules.

## Security and deployment limits

The API accepts only HTTP/HTTPS URLs, rejects embedded credentials and nonstandard ports, and resolves the hostname to reject private or reserved addresses. The worker blocks requests to other hostnames and revalidates same-host browser requests. Redirects to a different hostname fail. These checks are defense in depth and do not eliminate DNS rebinding or time-of-check/time-of-use races.

Before allowing untrusted users or public traffic, deploy the worker in a locked-down container or VM with outbound network egress filtering that blocks loopback, private, link-local, multicast, and cloud metadata ranges. Restrict ports and protocols, enforce CPU/memory/runtime limits, avoid host mounts and secrets, and add authentication, per-user and per-IP quotas, rate limiting, authorization on scan reads, abuse monitoring, and retention/deletion controls. Current scan retrieval and history are instance-wide and unauthenticated, so use this only on a trusted local machine or behind a private access boundary. The app has no user accounts or ownership model.

The worker queue uses concurrency 2 and has per-minute queue limiting. Browser navigation has a configurable `SCAN_NAVIGATION_TIMEOUT_MS` limit (default 20 seconds, bounded to 100 ms–60 seconds). The API and worker are run as local processes by the documented development workflow; Compose provisions PostgreSQL and Redis only. Production container images, deployment manifests, authentication, and infrastructure-level egress rules are not included. Browser request interception and DNS checks are application-level defenses only; they do not isolate the host worker process from internal networks or prevent DNS time-of-check/time-of-use races. Keep the worker on a trusted machine until it runs behind a network egress firewall or a vetted outbound proxy that blocks private, link-local, metadata, and internal service ranges.

## Known limitations

- Audits one page, not a full website.
- Automated axe checks cannot detect every accessibility problem; manual review remains necessary.
- No accounts, access control, scan cancellation, export, comparison, or retention job.
- The test suite covers URL and request policy, schema validation, status transitions, normalization, failure messaging, and result persistence; it does not replace a broad API/browser integration suite.
- The frontend currently shows the latest ten scans; the API supports pagination and filters.
- Public deployment requires the additional protections described above.
