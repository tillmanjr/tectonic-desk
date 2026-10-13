# Tectonic Desk live build: Foundation

Date: 2026-10-13
Status: approved

## Context

Tectonic Desk is an earth-sciences dashboard for a reader with formal geology
training. Scope: earthquakes now, volcanoes next, space weather considered
after that. A static prototype in `quake/` (frozen, historical reference only)
established the design, the focal-mechanism math, and the data the page needs.

The live build is split into four sub-projects, each with its own spec, plan
and implementation pass:

1. **Foundation** (this document): repo structure, toolchain, Fastify skeleton,
   Postgres with migrations, core schema and repository layer, tests, lint.
2. **Ingest**: USGS feed poller, upsert by event id, moment-tensor detail
   fetch, history retention.
3. **API**: HTTP routes the front end needs.
4. **Front end**: Vue 3 + Vite port of the prototype against the API.

## Decisions

| Topic                    | Choice                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Language                 | TypeScript, strict, ESM                                    |
| Runtime                  | Node 24 LTS                                                |
| Package manager          | pnpm workspaces                                            |
| Server                   | Fastify                                                    |
| Database                 | PostgreSQL 16 via Docker Compose                           |
| DB access and migrations | Drizzle ORM + drizzle-kit, generated SQL checked in        |
| Tests                    | Vitest, v8 coverage, Testcontainers for Postgres           |
| Lint and format          | ESLint flat config with typescript-eslint, Prettier        |
| Front end (later)        | Vue 3 + Vite; placeholder package only in Foundation       |
| Git                      | One repo at `tectonic-desk/`, `quake/` committed untouched |

## 1. Repository layout

```
tectonic-desk/
  package.json, pnpm-workspace.yaml, tsconfig.base.json
  eslint.config.js, .prettierrc, .editorconfig, .gitignore, .node-version
  docker-compose.yml          Postgres 16 with a named volume
  .env.example
  README.md, CLAUDE.md        root docs; CLAUDE.md points at quake/ as reference
  apps/server/                Fastify + Drizzle
  apps/web/                   placeholder package (port is sub-project 4)
  packages/shared/            domain types shared by server and web
  quake/                      frozen prototype, never modified
  docs/superpowers/specs/     design docs
```

`apps/server` internal layout:

```
src/
  index.ts            entry: load config, buildApp, listen. Only file that listens.
  app.ts              buildApp(opts): Fastify instance with plugins and routes
  config.ts           zod-validated environment
  db/
    client.ts         pg Pool + drizzle handle, createDb(url)
    schema.ts         Drizzle table definitions
    migrate.ts        programmatic migration runner (used by tests and db:migrate)
    migrations/       drizzle-kit output (SQL + meta), checked in
  repositories/
    events.ts
    mechanisms.ts
  mappers/
    events.ts         Drizzle row <-> shared Event
    mechanisms.ts     Drizzle row <-> shared Mechanism
  routes/
    health.ts         GET /api/health
test/
  setup/postgres.ts   Testcontainers helper
  *.test.ts
```

## 2. Server toolchain and runtime shape

- Dev runs with `tsx watch`; production builds with `tsc` to `dist/`.
- Configuration is read from environment variables and validated by a zod
  schema at startup. Missing or malformed values fail fast with a readable
  message. Variables:
  - `DATABASE_URL` (required)
  - `PORT` (default 3000)
  - `HOST` (default 127.0.0.1)
  - `LOG_LEVEL` (default `info`)
- Logging uses Fastify's built-in pino. Pretty printing is enabled when
  `NODE_ENV` is not `production`.
- `buildApp()` returns a configured Fastify instance without listening so tests
  can use `app.inject()`. It accepts a database handle so tests can pass the
  Testcontainers connection.
- One route: `GET /api/health` returns `{ status: "ok", db: "ok" }` with 200,
  or `{ status: "degraded", db: "error" }` with 503 when a `SELECT 1` fails.
- Root scripts: `dev`, `build`, `test`, `test:coverage`, `lint`, `format`,
  `typecheck`, `db:up`, `db:down`, `db:generate`, `db:migrate`.
- Coverage thresholds: 100% lines and branches for `apps/server/src`,
  excluding `index.ts` and the generated `db/migrations/` directory.

## 3. Schema (first migration)

Two tables. No PostGIS: regions are bounding boxes, so plain latitude and
longitude columns with a composite index suffice.

### `events`

| Column       | Type                               | Notes                               |
| ------------ | ---------------------------------- | ----------------------------------- |
| `id`         | text PK                            | USGS event id, e.g. `us6000u1q2`    |
| `time`       | timestamptz not null               | origin time                         |
| `updated`    | timestamptz not null               | USGS revision stamp                 |
| `latitude`   | double precision not null          |                                     |
| `longitude`  | double precision not null          |                                     |
| `depth_km`   | double precision                   | nullable                            |
| `mag`        | double precision                   | nullable                            |
| `mag_type`   | text                               | nullable                            |
| `place`      | text                               | nullable                            |
| `net`        | text                               | nullable                            |
| `status`     | text                               | `automatic` or `reviewed`, nullable |
| `alert`      | text                               | PAGER level, nullable               |
| `sig`        | integer                            | nullable                            |
| `felt`       | integer                            | nullable                            |
| `cdi`        | double precision                   | nullable                            |
| `mmi`        | double precision                   | nullable                            |
| `tsunami`    | boolean not null default false     |                                     |
| `first_seen` | timestamptz not null default now() |                                     |
| `last_seen`  | timestamptz not null default now() |                                     |
| `raw`        | jsonb not null                     | full USGS properties object         |

Indexes: `time`, `(latitude, longitude)`, `mag`.

### `mechanisms`

| Column                                                     | Type                                           | Notes                                         |
| ---------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `id`                                                       | serial PK                                      |                                               |
| `event_id`                                                 | text not null, FK events(id) on delete cascade |                                               |
| `kind`                                                     | text not null, check in (`mt`, `fm`)           | moment tensor or first-motion focal mechanism |
| `source`                                                   | text not null                                  | USGS product source network                   |
| `code`                                                     | text not null                                  | USGS product code                             |
| `preferred`                                                | boolean not null default false                 |                                               |
| `strike1 dip1 rake1 strike2 dip2 rake2`                    | double precision                               | nullable                                      |
| `t_azimuth t_plunge p_azimuth p_plunge n_azimuth n_plunge` | double precision                               | nullable                                      |
| `mrr mtt mpp mrt mrp mtp`                                  | double precision                               | nullable                                      |
| `scalar_moment`                                            | double precision                               | nullable, N m                                 |
| `mw`                                                       | double precision                               | nullable                                      |
| `depth_km`                                                 | double precision                               | nullable, centroid depth                      |
| `percent_dc`                                               | double precision                               | nullable, always a fraction 0..1              |
| `planes_reconstructed`                                     | boolean not null default false                 | true when planes derived from P and T axes    |
| `product_updated`                                          | timestamptz                                    | nullable                                      |
| `raw`                                                      | jsonb not null                                 | full product properties                       |

Unique: `(event_id, kind, source, code)`. Index: `event_id`.

## 4. Repository layer

Plain exported functions that take a Drizzle database handle as the first
argument. No classes, no global singletons.

- `upsertEvents(db, events: Event[]): Promise<{inserted, updated, skipped}>`
  Insert new rows. For existing rows, overwrite only when the incoming
  `updated` is greater than or equal to the stored value; always set
  `last_seen = now()`. Rows with an older `updated` count as skipped.
- `getEvent(db, id): Promise<EventWithMechanisms | null>`
- `listEvents(db, { since?, until?, minMag?, bbox?, limit? }): Promise<Event[]>`
  Ordered by `time` descending. `bbox` is `{ minLat, maxLat, minLon, maxLon }`.
  Default `limit` 500, maximum 5000.
- `upsertMechanism(db, mechanism: Mechanism): Promise<void>`
  Insert or update on the unique key.

`Event`, `Mechanism`, `EventWithMechanisms` and `BBox` are defined in
`packages/shared`. Mappers in `apps/server/src/mappers` convert between those
and Drizzle rows so `apps/web` never depends on Drizzle.

## 5. Testing and lint

- Vitest everywhere. Unit tests for config validation and mappers.
- Integration tests for repositories and the health route run against a
  Testcontainers Postgres 16 container: one container per test file, migrations
  applied on start, tables truncated between tests.
- If Docker is unreachable, integration tests skip with a clear message rather
  than failing obscurely.
- ESLint flat config at the root with typescript-eslint type-checked rules and
  `eslint-config-prettier`. Prettier for formatting. All workspace packages
  share the root config.

## Out of scope

USGS poller and detail fetch, events API routes, the Vue port, nginx,
user-defined regions, CI pipeline definitions, and any change to `quake/`.
