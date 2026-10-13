# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Tectonic Desk live-build repository: pnpm monorepo, Fastify server in TypeScript, Postgres 16 via Docker Compose with Drizzle migrations, the `events` and `mechanisms` schema, a tested repository layer, a health route, lint, and 100% coverage on the server.

**Architecture:** `apps/server` is a Fastify app whose `buildApp({ db })` takes a Drizzle handle so tests can inject a Testcontainers database. Repositories are plain functions over that handle. `packages/shared` holds domain types that the server maps to and from Drizzle rows so the future `apps/web` never depends on Drizzle. `apps/web` is a placeholder only.

**Tech Stack:** Node 24, pnpm 10 workspaces, TypeScript 5.9 (strict, ESM, NodeNext), Fastify 5, Drizzle ORM 0.45 + drizzle-kit 0.31, pg 8, zod 4, Vitest 5 with v8 coverage, @testcontainers/postgresql 12, ESLint 10 + typescript-eslint 8 + Prettier 3.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`. Deviations noted inline in this plan: migrations live in `apps/server/drizzle/migrations/` (not `src/db/migrations/`) so the built `dist/` can find them with the same relative path.
- `quake/` is frozen. Never modify anything under it.
- Host port 5432 is taken on this machine. Compose maps Postgres to host port **5433**.
- Pinned versions (exact, no carets): fastify 5.12.6, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, @types/pg 8.23.1, zod 4.6.7, pino-pretty 13.2.0, tsx 4.23.15, typescript 5.9.3, @types/node 24.19.2, vitest 5.0.4, @vitest/coverage-v8 5.0.4, @testcontainers/postgresql 12.2.0, eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.2, eslint-config-prettier 10.1.8, prettier 3.9.10, globals 17.13.0.
- Line endings LF everywhere (`.gitattributes`, Prettier `endOfLine: lf`).
- Coverage thresholds 100% lines, branches, functions, statements for `apps/server/src`, excluding `src/index.ts` and `src/db/migrate-cli.ts`.
- Package names: `@tectonic/server`, `@tectonic/shared`, `@tectonic/web`.
- Commit after every task with the Co-Authored-By trailer `Claude Fable 5.1 <noreply@anthropic.com>`.
- Shell on this machine is Git Bash; run commands from `F:/Sync/Xenomorph9/code/tectonic-desk` unless a step says otherwise.

---

## File map

| Path                                                                                 | Responsibility                         |
| ------------------------------------------------------------------------------------ | -------------------------------------- |
| `package.json`, `pnpm-workspace.yaml`                                                | workspace root, scripts, root dev deps |
| `.node-version`, `.gitattributes`, `.editorconfig`, `.prettierrc`, `.prettierignore` | toolchain conventions                  |
| `tsconfig.base.json`                                                                 | shared compiler options                |
| `eslint.config.js`                                                                   | root flat config, type-aware           |
| `docker-compose.yml`, `.env.example`                                                 | local Postgres on 5433                 |
| `packages/shared/src/index.ts`                                                       | domain types: Event, Mechanism, BBox   |
| `apps/web/package.json`, `apps/web/README.md`                                        | placeholder                            |
| `apps/server/src/config.ts`                                                          | zod env validation                     |
| `apps/server/src/logging.ts`                                                         | pino options from config               |
| `apps/server/src/db/schema.ts`                                                       | Drizzle tables and relations           |
| `apps/server/src/db/client.ts`                                                       | `createDb(url)`                        |
| `apps/server/src/db/migrate.ts`, `migrate-cli.ts`                                    | migration runner and CLI entry         |
| `apps/server/drizzle/migrations/`                                                    | drizzle-kit output                     |
| `apps/server/src/mappers/events.ts`, `mechanisms.ts`                                 | row <-> domain                         |
| `apps/server/src/repositories/events.ts`, `mechanisms.ts`                            | upsert and query                       |
| `apps/server/src/routes/health.ts`                                                   | GET /api/health                        |
| `apps/server/src/app.ts`, `index.ts`                                                 | buildApp and entry                     |
| `apps/server/test/setup/postgres.ts`                                                 | Testcontainers helper                  |
| `README.md`, `CLAUDE.md`                                                             | root docs                              |

---

### Task 1: Workspace scaffold, lint, typecheck

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `.node-version`, `.gitattributes`, `.editorconfig`, `.prettierrc`, `.prettierignore`, `tsconfig.base.json`, `eslint.config.js`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/tsconfig.build.json`, `packages/shared/src/index.ts`
- Create: `apps/web/package.json`, `apps/web/README.md`
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/tsconfig.build.json`, `apps/server/vitest.config.ts`, `apps/server/src/index.ts` (stub)
- Modify: `.gitignore`

**Interfaces:**

- Produces: `@tectonic/shared` exporting `Event`, `StoredEvent`, `Mechanism`, `StoredMechanism`, `EventWithMechanisms`, `BBox`, `MechanismKind`.
- Produces: root scripts `build`, `typecheck`, `lint`, `format`, `test`, `test:coverage`.

- [ ] **Step 1: Root config files**

`package.json`:

```json
{
  "name": "tectonic-desk",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.30.3",
  "engines": { "node": ">=24" },
  "scripts": {
    "shared:build": "pnpm --filter @tectonic/shared build",
    "build": "pnpm -r build",
    "typecheck": "pnpm shared:build && pnpm -r typecheck",
    "lint": "pnpm shared:build && eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "pnpm shared:build && pnpm -r test",
    "test:coverage": "pnpm shared:build && pnpm -r test:coverage",
    "dev": "pnpm --filter @tectonic/server dev",
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:generate": "pnpm --filter @tectonic/server db:generate",
    "db:migrate": "pnpm --filter @tectonic/server db:migrate"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "eslint": "10.12.0",
    "eslint-config-prettier": "10.1.8",
    "globals": "17.13.0",
    "prettier": "3.9.10",
    "typescript": "5.9.3",
    "typescript-eslint": "8.71.2"
  },
  "pnpm": { "onlyBuiltDependencies": ["esbuild"] }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

`.node-version`: `24`

`.gitattributes`:

```
* text=auto eol=lf
*.png binary
*.zip binary
```

`.editorconfig`:

```
root = true
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

`.prettierrc`:

```json
{ "endOfLine": "lf", "printWidth": 100, "singleQuote": false, "trailingComma": "all" }
```

`.prettierignore`:

```
node_modules
dist
coverage
quake
pnpm-lock.yaml
apps/server/drizzle/migrations
```

Append to `.gitignore`: `*.tsbuildinfo` and `.env.*.local`.

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

`eslint.config.js`:

```js
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/node_modules/", "**/dist/", "**/coverage/", "quake/", "**/drizzle/migrations/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.node,
    },
  },
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked },
  prettier,
);
```

- [ ] **Step 2: packages/shared**

`packages/shared/package.json`:

```json
{
  "name": "@tectonic/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.build.json"
  },
  "devDependencies": { "typescript": "5.9.3", "@types/node": "24.19.2" }
}
```

`packages/shared/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/shared/tsconfig.build.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "composite": true
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:

```ts
export type MechanismKind = "mt" | "fm";

/** An earthquake as received from USGS, before storage bookkeeping. */
export interface Event {
  id: string;
  time: Date;
  updated: Date;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  mag: number | null;
  magType: string | null;
  place: string | null;
  net: string | null;
  status: string | null;
  alert: string | null;
  sig: number | null;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  tsunami: boolean;
  raw: Record<string, unknown>;
}

export interface StoredEvent extends Event {
  firstSeen: Date;
  lastSeen: Date;
}

/** A moment tensor or first-motion focal mechanism product for an event. */
export interface Mechanism {
  eventId: string;
  kind: MechanismKind;
  source: string;
  code: string;
  preferred: boolean;
  strike1: number | null;
  dip1: number | null;
  rake1: number | null;
  strike2: number | null;
  dip2: number | null;
  rake2: number | null;
  tAzimuth: number | null;
  tPlunge: number | null;
  pAzimuth: number | null;
  pPlunge: number | null;
  nAzimuth: number | null;
  nPlunge: number | null;
  mrr: number | null;
  mtt: number | null;
  mpp: number | null;
  mrt: number | null;
  mrp: number | null;
  mtp: number | null;
  scalarMoment: number | null;
  mw: number | null;
  depthKm: number | null;
  /** Always a fraction in [0, 1]. */
  percentDc: number | null;
  planesReconstructed: boolean;
  productUpdated: Date | null;
  raw: Record<string, unknown>;
}

export interface StoredMechanism extends Mechanism {
  id: number;
}

export interface EventWithMechanisms extends StoredEvent {
  mechanisms: StoredMechanism[];
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}
```

- [ ] **Step 3: apps/web placeholder**

`apps/web/package.json`:

```json
{ "name": "@tectonic/web", "version": "0.0.0", "private": true, "type": "module" }
```

`apps/web/README.md`:

```md
# @tectonic/web

Placeholder. The Vue 3 + Vite port of the `quake/` prototype is sub-project 4.
```

- [ ] **Step 4: apps/server skeleton**

`apps/server/package.json`:

```json
{
  "name": "@tectonic/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --env-file-if-exists=../../.env --import tsx --watch src/index.ts",
    "start": "node --env-file-if-exists=../../.env dist/index.js",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node --env-file-if-exists=../../.env --import tsx src/db/migrate-cli.ts"
  },
  "dependencies": {
    "@tectonic/shared": "workspace:*",
    "drizzle-orm": "0.45.4",
    "fastify": "5.12.6",
    "pg": "8.23.1",
    "pino-pretty": "13.2.0",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "12.2.0",
    "@types/node": "24.19.2",
    "@types/pg": "8.23.1",
    "@vitest/coverage-v8": "5.0.4",
    "drizzle-kit": "0.31.11",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "vitest": "5.0.4"
  }
}
```

`apps/server/tsconfig.json` (typecheck and lint: everything):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src", "test", "*.ts"],
  "references": [{ "path": "../../packages/shared/tsconfig.build.json" }]
}
```

`apps/server/tsconfig.build.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "references": [{ "path": "../../packages/shared/tsconfig.build.json" }]
}
```

`apps/server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/db/migrate-cli.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
```

`apps/server/src/index.ts` (stub, replaced in Task 7):

```ts
console.log("tectonic-desk server: not implemented yet");
```

- [ ] **Step 5: Install and verify**

Run: `pnpm install`
Expected: lockfile written, no errors. If pnpm warns about ignored build scripts, note the package names; only add to `onlyBuiltDependencies` if something fails at runtime.

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all pass (run `pnpm format` first if Prettier complains, then re-check).

- [ ] **Step 6: Commit**

```bash
git add -A && git add --renormalize .
git commit -m "chore: scaffold pnpm workspace with shared types, server skeleton, lint and typecheck"
```

---

### Task 2: Docker Compose, env, config validation

**Files:**

- Create: `docker-compose.yml`, `.env.example`
- Create: `apps/server/src/config.ts`, `apps/server/test/config.test.ts`

**Interfaces:**

- Produces: `loadConfig(env?: Record<string, string | undefined>): Config` with `Config = { DATABASE_URL: string; PORT: number; HOST: string; LOG_LEVEL: LogLevel; NODE_ENV: "development" | "test" | "production" }`, throws `ConfigError`.

- [ ] **Step 1: Compose and env example**

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: tectonic-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: tectonic
      POSTGRES_PASSWORD: tectonic
      POSTGRES_DB: tectonic
    ports:
      - "5433:5432"
    volumes:
      - tectonic-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tectonic -d tectonic"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  tectonic-pgdata:
```

`.env.example`:

```
# Copy to .env at the repo root. Host port 5433 because 5432 is taken on the dev machine.
DATABASE_URL=postgres://tectonic:tectonic@localhost:5433/tectonic
PORT=3000
HOST=127.0.0.1
LOG_LEVEL=info
NODE_ENV=development
```

- [ ] **Step 2: Failing test**

`apps/server/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const valid = { DATABASE_URL: "postgres://u:p@localhost:5433/db" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig(valid);
    expect(c).toEqual({
      DATABASE_URL: valid.DATABASE_URL,
      PORT: 3000,
      HOST: "127.0.0.1",
      LOG_LEVEL: "info",
      NODE_ENV: "development",
    });
  });

  it("coerces PORT and accepts overrides", () => {
    const c = loadConfig({
      ...valid,
      PORT: "8080",
      HOST: "0.0.0.0",
      LOG_LEVEL: "debug",
      NODE_ENV: "production",
    });
    expect(c.PORT).toBe(8080);
    expect(c.HOST).toBe("0.0.0.0");
    expect(c.LOG_LEVEL).toBe("debug");
    expect(c.NODE_ENV).toBe("production");
  });

  it("throws ConfigError naming the bad variable", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...valid, PORT: "70000" })).toThrow(/PORT/);
    expect(() => loadConfig({ ...valid, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });

  it("reads process.env by default", () => {
    process.env.DATABASE_URL = valid.DATABASE_URL;
    expect(loadConfig().DATABASE_URL).toBe(valid.DATABASE_URL);
    delete process.env.DATABASE_URL;
  });
});
```

Run: `pnpm --filter @tectonic/server test`
Expected: FAIL, cannot find module `../src/config.js`.

- [ ] **Step 3: Implementation**

`apps/server/src/config.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = z.infer<typeof schema>;
export type LogLevel = Config["LOG_LEVEL"];

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: 4 passing.

- [ ] **Step 4: Lint, commit**

Run: `pnpm lint && pnpm typecheck`

```bash
git add -A
git commit -m "feat(server): docker compose on 5433 and zod-validated config"
```

---

### Task 3: Drizzle schema, client, migrations, Testcontainers helper

**Files:**

- Create: `apps/server/drizzle.config.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/db/client.ts`, `apps/server/src/db/migrate.ts`, `apps/server/src/db/migrate-cli.ts`
- Create: `apps/server/drizzle/migrations/0000_*.sql` and `meta/` (generated)
- Create: `apps/server/test/setup/postgres.ts`, `apps/server/test/db/migrate.test.ts`

**Interfaces:**

- Produces: `createDb(url): { db: Db; pool: pg.Pool; close(): Promise<void> }`, `type Db = NodePgDatabase<typeof schema>`.
- Produces: `runMigrations(db: Db): Promise<void>`.
- Produces: test helper `startPostgres(): Promise<TestDb>` where `TestDb = { db: Db; truncate(): Promise<void>; stop(): Promise<void> }`, and `dockerAvailable(): Promise<boolean>`.

- [ ] **Step 1: Schema**

`apps/server/src/db/schema.ts`:

```ts
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true, mode: "date" } as const;

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    time: timestamp("time", tz).notNull(),
    updated: timestamp("updated", tz).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    depthKm: doublePrecision("depth_km"),
    mag: doublePrecision("mag"),
    magType: text("mag_type"),
    place: text("place"),
    net: text("net"),
    status: text("status"),
    alert: text("alert"),
    sig: integer("sig"),
    felt: integer("felt"),
    cdi: doublePrecision("cdi"),
    mmi: doublePrecision("mmi"),
    tsunami: boolean("tsunami").notNull().default(false),
    firstSeen: timestamp("first_seen", tz).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", tz).notNull().defaultNow(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    index("events_time_idx").on(t.time),
    index("events_lat_lon_idx").on(t.latitude, t.longitude),
    index("events_mag_idx").on(t.mag),
  ],
);

export const mechanisms = pgTable(
  "mechanisms",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"mt" | "fm">().notNull(),
    source: text("source").notNull(),
    code: text("code").notNull(),
    preferred: boolean("preferred").notNull().default(false),
    strike1: doublePrecision("strike1"),
    dip1: doublePrecision("dip1"),
    rake1: doublePrecision("rake1"),
    strike2: doublePrecision("strike2"),
    dip2: doublePrecision("dip2"),
    rake2: doublePrecision("rake2"),
    tAzimuth: doublePrecision("t_azimuth"),
    tPlunge: doublePrecision("t_plunge"),
    pAzimuth: doublePrecision("p_azimuth"),
    pPlunge: doublePrecision("p_plunge"),
    nAzimuth: doublePrecision("n_azimuth"),
    nPlunge: doublePrecision("n_plunge"),
    mrr: doublePrecision("mrr"),
    mtt: doublePrecision("mtt"),
    mpp: doublePrecision("mpp"),
    mrt: doublePrecision("mrt"),
    mrp: doublePrecision("mrp"),
    mtp: doublePrecision("mtp"),
    scalarMoment: doublePrecision("scalar_moment"),
    mw: doublePrecision("mw"),
    depthKm: doublePrecision("depth_km"),
    percentDc: doublePrecision("percent_dc"),
    planesReconstructed: boolean("planes_reconstructed").notNull().default(false),
    productUpdated: timestamp("product_updated", tz),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    uniqueIndex("mechanisms_event_kind_source_code_uq").on(t.eventId, t.kind, t.source, t.code),
    index("mechanisms_event_id_idx").on(t.eventId),
    check("mechanisms_kind_check", sql`${t.kind} in ('mt', 'fm')`),
  ],
);

export const eventsRelations = relations(events, ({ many }) => ({
  mechanisms: many(mechanisms),
}));

export const mechanismsRelations = relations(mechanisms, ({ one }) => ({
  event: one(events, { fields: [mechanisms.eventId], references: [events.id] }),
}));

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type MechanismRow = typeof mechanisms.$inferSelect;
export type MechanismInsert = typeof mechanisms.$inferInsert;
```

- [ ] **Step 2: Client, migrator, CLI, drizzle config**

`apps/server/src/db/client.ts`:

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => pool.end() };
}
```

`apps/server/src/db/migrate.ts`:

```ts
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client.js";

/** Resolves to apps/server/drizzle/migrations from both src/db and dist/db. */
export const migrationsFolder = fileURLToPath(
  new URL("../../drizzle/migrations/", import.meta.url),
);

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
```

`apps/server/src/db/migrate-cli.ts`:

```ts
import { loadConfig } from "../config.js";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";

const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL);
try {
  await runMigrations(db);
  console.log("migrations applied");
} finally {
  await close();
}
```

`apps/server/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://tectonic:tectonic@localhost:5433/tectonic",
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: `apps/server/drizzle/migrations/0000_<name>.sql` plus `meta/_journal.json` and `meta/0000_snapshot.json`. Open the SQL and confirm both tables, three event indexes, the unique index, the FK with `on delete cascade`, and the check constraint.

- [ ] **Step 4: Testcontainers helper**

`apps/server/test/setup/postgres.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";

const exec = promisify(execFile);

export interface TestDb {
  db: Db;
  truncate: () => Promise<void>;
  stop: () => Promise<void>;
}

/** True when the Docker daemon answers; integration suites skip otherwise. */
export async function dockerAvailable(): Promise<boolean> {
  try {
    await exec("docker", ["info"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function startPostgres(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const { db, close } = createDb(container.getConnectionUri());
  await runMigrations(db);
  return {
    db,
    truncate: async () => {
      await db.execute(sql`truncate table mechanisms, events restart identity cascade`);
    },
    stop: async () => {
      await close();
      await container.stop();
    },
  };
}
```

- [ ] **Step 5: Migration test**

`apps/server/test/db/migrate.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("migrations", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });

  it("creates the events and mechanisms tables", async () => {
    const rows = await t.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const names = rows.rows.map((r) => r.table_name);
    expect(names).toContain("events");
    expect(names).toContain("mechanisms");
  });

  it("is idempotent", async () => {
    const { runMigrations } = await import("../../src/db/migrate.js");
    await expect(runMigrations(t.db)).resolves.toBeUndefined();
  });

  it("enforces the mechanism kind check", async () => {
    await t.db.execute(sql`insert into events (id, time, updated, latitude, longitude, raw)
      values ('x1', now(), now(), 0, 0, '{}'::jsonb)`);
    await expect(
      t.db.execute(sql`insert into mechanisms (event_id, kind, source, code, raw)
        values ('x1', 'zz', 'us', 'c', '{}'::jsonb)`),
    ).rejects.toThrow(/mechanisms_kind_check/);
    await t.truncate();
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: the container pulls `postgres:16-alpine` on first run (slow), then 3 passing.

- [ ] **Step 6: Lint, commit**

Run: `pnpm lint && pnpm typecheck`

```bash
git add -A
git commit -m "feat(server): drizzle schema for events and mechanisms, migrations, testcontainers helper"
```

---

### Task 4: Mappers

**Files:**

- Create: `apps/server/src/mappers/events.ts`, `apps/server/src/mappers/mechanisms.ts`
- Create: `apps/server/test/mappers/events.test.ts`, `apps/server/test/mappers/mechanisms.test.ts`
- Create: `apps/server/test/fixtures.ts`

**Interfaces:**

- Produces: `rowToEvent(row: EventRow): StoredEvent`, `eventToRow(e: Event): EventInsert`, `rowToMechanism(row: MechanismRow): StoredMechanism`, `mechanismToRow(m: Mechanism): MechanismInsert`.
- Produces: fixtures `makeEvent(overrides?: Partial<Event>): Event`, `makeMechanism(overrides?: Partial<Mechanism>): Mechanism`.

- [ ] **Step 1: Fixtures**

`apps/server/test/fixtures.ts`:

```ts
import type { Event, Mechanism } from "@tectonic/shared";

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "us6000u1pl",
    time: new Date("2026-10-12T04:38:12.859Z"),
    updated: new Date("2026-10-12T06:00:00.000Z"),
    latitude: -18.723,
    longitude: -175.1452,
    depthKm: 195.212,
    mag: 5.5,
    magType: "mww",
    place: "122 km W of Neiafu, Tonga",
    net: "us",
    status: "reviewed",
    alert: "green",
    sig: 465,
    felt: null,
    cdi: null,
    mmi: 2.823,
    tsunami: false,
    raw: { title: "M 5.5 - 122 km W of Neiafu, Tonga" },
    ...overrides,
  };
}

export function makeMechanism(overrides: Partial<Mechanism> = {}): Mechanism {
  return {
    eventId: "us6000u1pl",
    kind: "mt",
    source: "us",
    code: "us6000u1pl_mww",
    preferred: true,
    strike1: 12.67,
    dip1: 68.63,
    rake1: -126.14,
    strike2: 256.15,
    dip2: 41.23,
    rake2: -33.56,
    tAzimuth: 128,
    tPlunge: 16,
    pAzimuth: 240,
    pPlunge: 52,
    nAzimuth: null,
    nPlunge: null,
    mrr: null,
    mtt: null,
    mpp: null,
    mrt: null,
    mrp: null,
    mtp: null,
    scalarMoment: 1.9e17,
    mw: 5.5,
    depthKm: 190.5,
    percentDc: 0.8949,
    planesReconstructed: false,
    productUpdated: new Date("2026-10-12T05:30:00.000Z"),
    raw: { "derived-magnitude-type": "Mww" },
    ...overrides,
  };
}
```

- [ ] **Step 2: Failing tests**

`apps/server/test/mappers/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventToRow, rowToEvent } from "../../src/mappers/events.js";
import { makeEvent } from "../fixtures.js";

describe("event mappers", () => {
  it("round-trips through a row, adding bookkeeping on the way back", () => {
    const e = makeEvent();
    const row = eventToRow(e);
    expect(row).not.toHaveProperty("firstSeen");
    expect(row).not.toHaveProperty("lastSeen");
    const seen = new Date("2026-10-12T07:00:00Z");
    const back = rowToEvent({
      ...row,
      tsunami: row.tsunami ?? false,
      firstSeen: seen,
      lastSeen: seen,
    });
    expect(back).toEqual({ ...e, firstSeen: seen, lastSeen: seen });
  });

  it("drops unknown row columns", () => {
    const row = {
      ...eventToRow(makeEvent()),
      firstSeen: new Date(),
      lastSeen: new Date(),
      extra: 1,
    };
    expect(rowToEvent(row)).not.toHaveProperty("extra");
  });
});
```

`apps/server/test/mappers/mechanisms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mechanismToRow, rowToMechanism } from "../../src/mappers/mechanisms.js";
import { makeMechanism } from "../fixtures.js";

describe("mechanism mappers", () => {
  it("round-trips through a row, adding the serial id on the way back", () => {
    const m = makeMechanism();
    const row = mechanismToRow(m);
    expect(row).not.toHaveProperty("id");
    const back = rowToMechanism({ ...row, id: 7, preferred: true, planesReconstructed: false });
    expect(back).toEqual({ ...m, id: 7 });
  });

  it("drops unknown row columns", () => {
    const row = { ...mechanismToRow(makeMechanism()), id: 1, extra: "x" };
    expect(rowToMechanism(row)).not.toHaveProperty("extra");
  });
});
```

Run: `pnpm --filter @tectonic/server test`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implementation**

`apps/server/src/mappers/events.ts`:

```ts
import type { Event, StoredEvent } from "@tectonic/shared";
import type { EventInsert, EventRow } from "../db/schema.js";

export function rowToEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    time: row.time,
    updated: row.updated,
    latitude: row.latitude,
    longitude: row.longitude,
    depthKm: row.depthKm,
    mag: row.mag,
    magType: row.magType,
    place: row.place,
    net: row.net,
    status: row.status,
    alert: row.alert,
    sig: row.sig,
    felt: row.felt,
    cdi: row.cdi,
    mmi: row.mmi,
    tsunami: row.tsunami,
    raw: row.raw,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
  };
}

export function eventToRow(e: Event): EventInsert {
  return {
    id: e.id,
    time: e.time,
    updated: e.updated,
    latitude: e.latitude,
    longitude: e.longitude,
    depthKm: e.depthKm,
    mag: e.mag,
    magType: e.magType,
    place: e.place,
    net: e.net,
    status: e.status,
    alert: e.alert,
    sig: e.sig,
    felt: e.felt,
    cdi: e.cdi,
    mmi: e.mmi,
    tsunami: e.tsunami,
    raw: e.raw,
  };
}
```

`apps/server/src/mappers/mechanisms.ts`:

```ts
import type { Mechanism, StoredMechanism } from "@tectonic/shared";
import type { MechanismInsert, MechanismRow } from "../db/schema.js";

export function rowToMechanism(row: MechanismRow): StoredMechanism {
  return {
    id: row.id,
    eventId: row.eventId,
    kind: row.kind,
    source: row.source,
    code: row.code,
    preferred: row.preferred,
    strike1: row.strike1,
    dip1: row.dip1,
    rake1: row.rake1,
    strike2: row.strike2,
    dip2: row.dip2,
    rake2: row.rake2,
    tAzimuth: row.tAzimuth,
    tPlunge: row.tPlunge,
    pAzimuth: row.pAzimuth,
    pPlunge: row.pPlunge,
    nAzimuth: row.nAzimuth,
    nPlunge: row.nPlunge,
    mrr: row.mrr,
    mtt: row.mtt,
    mpp: row.mpp,
    mrt: row.mrt,
    mrp: row.mrp,
    mtp: row.mtp,
    scalarMoment: row.scalarMoment,
    mw: row.mw,
    depthKm: row.depthKm,
    percentDc: row.percentDc,
    planesReconstructed: row.planesReconstructed,
    productUpdated: row.productUpdated,
    raw: row.raw,
  };
}

export function mechanismToRow(m: Mechanism): MechanismInsert {
  return {
    eventId: m.eventId,
    kind: m.kind,
    source: m.source,
    code: m.code,
    preferred: m.preferred,
    strike1: m.strike1,
    dip1: m.dip1,
    rake1: m.rake1,
    strike2: m.strike2,
    dip2: m.dip2,
    rake2: m.rake2,
    tAzimuth: m.tAzimuth,
    tPlunge: m.tPlunge,
    pAzimuth: m.pAzimuth,
    pPlunge: m.pPlunge,
    nAzimuth: m.nAzimuth,
    nPlunge: m.nPlunge,
    mrr: m.mrr,
    mtt: m.mtt,
    mpp: m.mpp,
    mrt: m.mrt,
    mrp: m.mrp,
    mtp: m.mtp,
    scalarMoment: m.scalarMoment,
    mw: m.mw,
    depthKm: m.depthKm,
    percentDc: m.percentDc,
    planesReconstructed: m.planesReconstructed,
    productUpdated: m.productUpdated,
    raw: m.raw,
  };
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: all passing.

- [ ] **Step 4: Lint, commit**

```bash
pnpm lint && pnpm typecheck
git add -A
git commit -m "feat(server): mappers between shared domain types and drizzle rows"
```

---

### Task 5: Events repository

**Files:**

- Create: `apps/server/src/repositories/events.ts`, `apps/server/test/repositories/events.test.ts`

**Interfaces:**

- Produces: `upsertEvents(db: Db, events: Event[]): Promise<UpsertResult>` with `UpsertResult = { inserted: number; updated: number; skipped: number }`.
- Produces: `listEvents(db: Db, filter?: ListEventsFilter): Promise<StoredEvent[]>` with `ListEventsFilter = { since?: Date; until?: Date; minMag?: number; bbox?: BBox; limit?: number }`.
- Produces: `getEvent(db: Db, id: string): Promise<EventWithMechanisms | null>` (mechanisms array populated in Task 6; empty here).

- [ ] **Step 1: Failing tests**

`apps/server/test/repositories/events.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getEvent, listEvents, upsertEvents } from "../../src/repositories/events.js";
import { makeEvent } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("events repository", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
  });

  it("returns zero counts for an empty batch", async () => {
    expect(await upsertEvents(t.db, [])).toEqual({ inserted: 0, updated: 0, skipped: 0 });
  });

  it("inserts new events and reads them back with bookkeeping", async () => {
    const e = makeEvent();
    expect(await upsertEvents(t.db, [e])).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    const got = await getEvent(t.db, e.id);
    expect(got).toMatchObject({ ...e, mechanisms: [] });
    expect(got?.firstSeen).toBeInstanceOf(Date);
    expect(got?.lastSeen).toBeInstanceOf(Date);
  });

  it("returns null for an unknown id", async () => {
    expect(await getEvent(t.db, "nope")).toBeNull();
  });

  it("updates when the incoming revision is newer or equal, skips when older", async () => {
    const e = makeEvent({ updated: new Date("2026-10-12T06:00:00Z"), mag: 5.5 });
    await upsertEvents(t.db, [e]);

    const newer = { ...e, updated: new Date("2026-10-12T07:00:00Z"), mag: 5.6 };
    expect(await upsertEvents(t.db, [newer])).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect((await getEvent(t.db, e.id))?.mag).toBe(5.6);

    const same = { ...newer, mag: 5.7 };
    expect(await upsertEvents(t.db, [same])).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect((await getEvent(t.db, e.id))?.mag).toBe(5.7);

    const older = { ...e, mag: 9.9 };
    expect(await upsertEvents(t.db, [older])).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect((await getEvent(t.db, e.id))?.mag).toBe(5.7);
  });

  it("bumps last_seen even when the revision is skipped, keeps first_seen", async () => {
    const e = makeEvent();
    await upsertEvents(t.db, [e]);
    const first = await getEvent(t.db, e.id);
    await t.db.execute(
      sql`update events set last_seen = last_seen - interval '1 hour', first_seen = first_seen - interval '1 hour'`,
    );
    const aged = await getEvent(t.db, e.id);
    await upsertEvents(t.db, [{ ...e, updated: new Date(e.updated.getTime() - 1000) }]);
    const after = await getEvent(t.db, e.id);
    expect(after?.lastSeen.getTime()).toBeGreaterThan(aged?.lastSeen.getTime() ?? 0);
    expect(after?.firstSeen.getTime()).toBe(aged?.firstSeen.getTime());
    expect(first).not.toBeNull();
  });

  it("deduplicates a batch by id, keeping the latest revision", async () => {
    const a = makeEvent({ updated: new Date("2026-10-12T06:00:00Z"), mag: 5.0 });
    const b = { ...a, updated: new Date("2026-10-12T06:30:00Z"), mag: 5.2 };
    expect(await upsertEvents(t.db, [b, a])).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    expect((await getEvent(t.db, a.id))?.mag).toBe(5.2);
  });

  it("handles batches larger than one chunk", async () => {
    const many = Array.from({ length: 1203 }, (_, i) => makeEvent({ id: `ev${String(i)}` }));
    expect(await upsertEvents(t.db, many)).toEqual({ inserted: 1203, updated: 0, skipped: 0 });
    expect((await listEvents(t.db, { limit: 5000 })).length).toBe(1203);
  });

  describe("listEvents", () => {
    beforeEach(async () => {
      await upsertEvents(t.db, [
        makeEvent({
          id: "a",
          time: new Date("2026-10-10T00:00:00Z"),
          mag: 4.5,
          latitude: 40,
          longitude: -120,
        }),
        makeEvent({
          id: "b",
          time: new Date("2026-10-11T00:00:00Z"),
          mag: 5.5,
          latitude: 10,
          longitude: 100,
        }),
        makeEvent({
          id: "c",
          time: new Date("2026-10-12T00:00:00Z"),
          mag: 6.5,
          latitude: -18,
          longitude: 179.5,
        }),
        makeEvent({
          id: "d",
          time: new Date("2026-10-12T01:00:00Z"),
          mag: null,
          latitude: -18,
          longitude: -179.5,
        }),
      ]);
    });

    it("orders by time descending with default limit", async () => {
      expect((await listEvents(t.db)).map((e) => e.id)).toEqual(["d", "c", "b", "a"]);
    });

    it("filters by since and until inclusively", async () => {
      const r = await listEvents(t.db, {
        since: new Date("2026-10-11T00:00:00Z"),
        until: new Date("2026-10-12T00:00:00Z"),
      });
      expect(r.map((e) => e.id)).toEqual(["c", "b"]);
    });

    it("filters by minMag and excludes null magnitudes", async () => {
      expect((await listEvents(t.db, { minMag: 5.5 })).map((e) => e.id)).toEqual(["c", "b"]);
    });

    it("filters by a plain bbox", async () => {
      const r = await listEvents(t.db, {
        bbox: { minLat: 27, maxLat: 53, minLon: -136, maxLon: -104 },
      });
      expect(r.map((e) => e.id)).toEqual(["a"]);
    });

    it("filters by a bbox that crosses the antimeridian", async () => {
      const r = await listEvents(t.db, {
        bbox: { minLat: -30, maxLat: 0, minLon: 170, maxLon: -170 },
      });
      expect(r.map((e) => e.id)).toEqual(["d", "c"]);
    });

    it("clamps limit to the maximum and rejects non-positive values", async () => {
      expect((await listEvents(t.db, { limit: 2 })).length).toBe(2);
      expect((await listEvents(t.db, { limit: 99999 })).length).toBe(4);
      await expect(listEvents(t.db, { limit: 0 })).rejects.toThrow(/limit/);
    });
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: FAIL, module not found.

- [ ] **Step 2: Implementation**

`apps/server/src/repositories/events.ts`:

```ts
import type { BBox, Event, EventWithMechanisms, StoredEvent } from "@tectonic/shared";
import { and, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";
import { eventToRow, rowToEvent } from "../mappers/events.js";
import { rowToMechanism } from "../mappers/mechanisms.js";

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface ListEventsFilter {
  since?: Date;
  until?: Date;
  minMag?: number;
  bbox?: BBox;
  limit?: number;
}

export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 5000;
const CHUNK = 500;

const excluded = (column: string): SQL => sql.raw(`excluded."${column}"`);

const updateSet = {
  time: excluded("time"),
  updated: excluded("updated"),
  latitude: excluded("latitude"),
  longitude: excluded("longitude"),
  depthKm: excluded("depth_km"),
  mag: excluded("mag"),
  magType: excluded("mag_type"),
  place: excluded("place"),
  net: excluded("net"),
  status: excluded("status"),
  alert: excluded("alert"),
  sig: excluded("sig"),
  felt: excluded("felt"),
  cdi: excluded("cdi"),
  mmi: excluded("mmi"),
  tsunami: excluded("tsunami"),
  raw: excluded("raw"),
};

/** Keeps one entry per id, the one with the latest `updated`. */
function dedupe(batch: Event[]): Event[] {
  const byId = new Map<string, Event>();
  for (const e of batch) {
    const prev = byId.get(e.id);
    if (!prev || e.updated.getTime() >= prev.updated.getTime()) byId.set(e.id, e);
  }
  return [...byId.values()];
}

export async function upsertEvents(db: Db, batch: Event[]): Promise<UpsertResult> {
  const unique = dedupe(batch);
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0 };
  if (unique.length === 0) return result;

  await db.transaction(async (tx) => {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const touched = await tx
        .insert(events)
        .values(chunk.map(eventToRow))
        .onConflictDoUpdate({
          target: events.id,
          set: updateSet,
          setWhere: sql`excluded.updated >= ${events.updated}`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const row of touched) {
        if (row.inserted) result.inserted += 1;
        else result.updated += 1;
      }
      result.skipped += chunk.length - touched.length;
      await tx
        .update(events)
        .set({ lastSeen: sql`now()` })
        .where(
          inArray(
            events.id,
            chunk.map((e) => e.id),
          ),
        );
    }
  });
  return result;
}

function bboxCondition(b: BBox): SQL {
  const lat = and(gte(events.latitude, b.minLat), lte(events.latitude, b.maxLat));
  const lon =
    b.minLon <= b.maxLon
      ? and(gte(events.longitude, b.minLon), lte(events.longitude, b.maxLon))
      : or(gte(events.longitude, b.minLon), lte(events.longitude, b.maxLon));
  return and(lat, lon) as SQL;
}

export async function listEvents(db: Db, filter: ListEventsFilter = {}): Promise<StoredEvent[]> {
  const requested = filter.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new RangeError(`limit must be a positive integer, got ${String(requested)}`);
  }
  const limit = Math.min(requested, MAX_LIMIT);

  const conditions: SQL[] = [];
  if (filter.since) conditions.push(gte(events.time, filter.since));
  if (filter.until) conditions.push(lte(events.time, filter.until));
  if (filter.minMag !== undefined) conditions.push(gte(events.mag, filter.minMag));
  if (filter.bbox) conditions.push(bboxCondition(filter.bbox));

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(events.time), desc(events.id))
    .limit(limit);
  return rows.map(rowToEvent);
}

export async function getEvent(db: Db, id: string): Promise<EventWithMechanisms | null> {
  const row = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: { mechanisms: true },
  });
  if (!row) return null;
  return { ...rowToEvent(row), mechanisms: row.mechanisms.map(rowToMechanism) };
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: all passing. If `setWhere` is rejected by the Drizzle types, the fallback is `sql` in `set` values guarded with CASE; prefer fixing the option name first (check `node_modules/drizzle-orm/pg-core/query-builders/insert.d.ts`).

- [ ] **Step 3: Lint, commit**

```bash
pnpm lint && pnpm typecheck
git add -A
git commit -m "feat(server): events repository with revision-aware upsert and filtered listing"
```

---

### Task 6: Mechanisms repository

**Files:**

- Create: `apps/server/src/repositories/mechanisms.ts`, `apps/server/test/repositories/mechanisms.test.ts`

**Interfaces:**

- Produces: `upsertMechanism(db: Db, m: Mechanism): Promise<void>`.

- [ ] **Step 1: Failing tests**

`apps/server/test/repositories/mechanisms.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getEvent, upsertEvents } from "../../src/repositories/events.js";
import { upsertMechanism } from "../../src/repositories/mechanisms.js";
import { makeEvent, makeMechanism } from "../fixtures.js";
import { dockerAvailable, startPostgres, type TestDb } from "../setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("mechanisms repository", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });
  beforeEach(async () => {
    await t.truncate();
    await upsertEvents(t.db, [makeEvent()]);
  });

  it("inserts and is returned with the event", async () => {
    const m = makeMechanism();
    await upsertMechanism(t.db, m);
    const got = await getEvent(t.db, m.eventId);
    expect(got?.mechanisms).toHaveLength(1);
    expect(got?.mechanisms[0]).toMatchObject(m);
    expect(got?.mechanisms[0]?.id).toEqual(expect.any(Number));
  });

  it("updates in place on the unique key instead of duplicating", async () => {
    const m = makeMechanism();
    await upsertMechanism(t.db, m);
    await upsertMechanism(t.db, { ...m, mw: 5.6, percentDc: 0.9, preferred: false });
    const got = await getEvent(t.db, m.eventId);
    expect(got?.mechanisms).toHaveLength(1);
    expect(got?.mechanisms[0]).toMatchObject({ mw: 5.6, percentDc: 0.9, preferred: false });
  });

  it("keeps distinct products apart", async () => {
    await upsertMechanism(t.db, makeMechanism({ kind: "mt", source: "us", code: "a" }));
    await upsertMechanism(t.db, makeMechanism({ kind: "fm", source: "nc", code: "b" }));
    expect((await getEvent(t.db, "us6000u1pl"))?.mechanisms).toHaveLength(2);
  });

  it("rejects a mechanism for an unknown event", async () => {
    await expect(upsertMechanism(t.db, makeMechanism({ eventId: "missing" }))).rejects.toThrow(
      /foreign key/i,
    );
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: FAIL, module not found.

- [ ] **Step 2: Implementation**

`apps/server/src/repositories/mechanisms.ts`:

```ts
import type { Mechanism } from "@tectonic/shared";
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { mechanisms } from "../db/schema.js";
import { mechanismToRow } from "../mappers/mechanisms.js";

const excluded = (column: string): SQL => sql.raw(`excluded."${column}"`);

const updateSet = {
  preferred: excluded("preferred"),
  strike1: excluded("strike1"),
  dip1: excluded("dip1"),
  rake1: excluded("rake1"),
  strike2: excluded("strike2"),
  dip2: excluded("dip2"),
  rake2: excluded("rake2"),
  tAzimuth: excluded("t_azimuth"),
  tPlunge: excluded("t_plunge"),
  pAzimuth: excluded("p_azimuth"),
  pPlunge: excluded("p_plunge"),
  nAzimuth: excluded("n_azimuth"),
  nPlunge: excluded("n_plunge"),
  mrr: excluded("mrr"),
  mtt: excluded("mtt"),
  mpp: excluded("mpp"),
  mrt: excluded("mrt"),
  mrp: excluded("mrp"),
  mtp: excluded("mtp"),
  scalarMoment: excluded("scalar_moment"),
  mw: excluded("mw"),
  depthKm: excluded("depth_km"),
  percentDc: excluded("percent_dc"),
  planesReconstructed: excluded("planes_reconstructed"),
  productUpdated: excluded("product_updated"),
  raw: excluded("raw"),
};

export async function upsertMechanism(db: Db, m: Mechanism): Promise<void> {
  await db
    .insert(mechanisms)
    .values(mechanismToRow(m))
    .onConflictDoUpdate({
      target: [mechanisms.eventId, mechanisms.kind, mechanisms.source, mechanisms.code],
      set: updateSet,
    });
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: all passing.

- [ ] **Step 3: Lint, commit**

```bash
pnpm lint && pnpm typecheck
git add -A
git commit -m "feat(server): mechanisms repository upsert on product key"
```

---

### Task 7: Fastify app, health route, logging, entry point

**Files:**

- Create: `apps/server/src/logging.ts`, `apps/server/src/routes/health.ts`, `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts` (replace stub)
- Create: `apps/server/test/logging.test.ts`, `apps/server/test/routes/health.test.ts`, `apps/server/test/app.test.ts`

**Interfaces:**

- Produces: `buildApp({ db, logger? }): FastifyInstance` with `app.db` decorated.
- Produces: `buildLoggerOptions(config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">): FastifyServerOptions["logger"]`.

- [ ] **Step 1: Failing tests**

`apps/server/test/logging.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLoggerOptions } from "../src/logging.js";

describe("buildLoggerOptions", () => {
  it("uses plain JSON logging in production", () => {
    expect(buildLoggerOptions({ LOG_LEVEL: "warn", NODE_ENV: "production" })).toEqual({
      level: "warn",
    });
  });

  it("pretty prints outside production", () => {
    expect(buildLoggerOptions({ LOG_LEVEL: "debug", NODE_ENV: "development" })).toEqual({
      level: "debug",
      transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } },
    });
  });
});
```

`apps/server/test/routes/health.test.ts` (unit, fake db, no Docker):

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";

function fakeDb(execute: () => Promise<unknown>): Db {
  return { execute } as unknown as Db;
}

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    const app = buildApp({ db: fakeDb(() => Promise.resolve({ rows: [] })) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "ok" });
    await app.close();
  });

  it("reports degraded with 503 when the database fails", async () => {
    const app = buildApp({ db: fakeDb(() => Promise.reject(new Error("boom"))) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "degraded", db: "error" });
    await app.close();
  });
});
```

`apps/server/test/app.test.ts` (integration):

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { dockerAvailable, startPostgres, type TestDb } from "./setup/postgres.js";

const docker = await dockerAvailable();

describe.skipIf(!docker)("app against a real database", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await startPostgres();
  });
  afterAll(async () => {
    await t.stop();
  });

  it("exposes the db handle and answers health", async () => {
    const app = buildApp({ db: t.db });
    expect(app.db).toBe(t.db);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ status: "ok", db: "ok" });
    await app.close();
  });
});

if (!docker) {
  it("skipped: Docker is not reachable, start Docker Desktop to run integration tests", () => {
    expect(true).toBe(true);
  });
}
```

Run: `pnpm --filter @tectonic/server test`
Expected: FAIL, modules not found.

- [ ] **Step 2: Implementation**

`apps/server/src/logging.ts`:

```ts
import type { FastifyServerOptions } from "fastify";
import type { Config } from "./config.js";

export function buildLoggerOptions(
  config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">,
): FastifyServerOptions["logger"] {
  if (config.NODE_ENV === "production") return { level: config.LOG_LEVEL };
  return {
    level: config.LOG_LEVEL,
    transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } },
  };
}
```

`apps/server/src/routes/health.ts`:

```ts
import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/health", async (_request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: "ok", db: "ok" };
    } catch (err) {
      app.log.error({ err }, "database health check failed");
      void reply.code(503);
      return { status: "degraded", db: "error" };
    }
  });
};
```

`apps/server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Db } from "./db/client.js";
import { healthRoutes } from "./routes/health.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}

export interface AppOptions {
  db: Db;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp({ db, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  app.decorate("db", db);
  void app.register(healthRoutes);
  return app;
}
```

`apps/server/src/index.ts`:

```ts
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { buildLoggerOptions } from "./logging.js";

const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL);
const app = buildApp({ db, logger: buildLoggerOptions(config) });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.PORT, host: config.HOST });
```

Run: `pnpm --filter @tectonic/server test`
Expected: all passing.

- [ ] **Step 3: Coverage, lint, commit**

Run: `pnpm test:coverage`
Expected: thresholds met (100% on all four). If a branch is uncovered, add a test for it rather than lowering the threshold.

```bash
pnpm lint && pnpm typecheck && pnpm build
git add -A
git commit -m "feat(server): fastify app with health route, logger options and entry point"
```

---

### Task 8: Live smoke, docs, final verification

**Files:**

- Create: `README.md`, `CLAUDE.md` (root)
- Create: `.env` (local only, gitignored)

- [ ] **Step 1: Bring up Postgres and migrate**

```bash
cp .env.example .env
pnpm db:up
docker compose ps   # wait for healthy
pnpm db:migrate
```

Expected: `migrations applied`.

- [ ] **Step 2: Run the server and hit health**

Run in background: `pnpm dev`
Then: `curl -s http://127.0.0.1:3000/api/health`
Expected: `{"status":"ok","db":"ok"}`. Stop the dev server afterwards.

- [ ] **Step 3: Root docs**

`README.md`:

````md
# Tectonic Desk

An earth-sciences dashboard: earthquakes now, volcanoes next, space weather considered after that.
Written for a reader with formal geology training.

## Layout

- `apps/server` Fastify + Drizzle + Postgres (TypeScript)
- `apps/web` placeholder for the Vue 3 + Vite front end
- `packages/shared` domain types shared by server and web
- `quake/` the original static prototype, frozen as historical reference
- `docs/superpowers` design specs and implementation plans

## Prerequisites

Node 24, pnpm 10, Docker Desktop.

## Setup

```bash
pnpm install
cp .env.example .env     # Postgres is exposed on host port 5433
pnpm db:up
pnpm db:migrate
pnpm dev                 # http://127.0.0.1:3000/api/health
```
````

## Scripts

| Script                      | What it does                                              |
| --------------------------- | --------------------------------------------------------- |
| `pnpm test`                 | all tests; integration tests need Docker (Testcontainers) |
| `pnpm test:coverage`        | tests with 100% thresholds on `apps/server/src`           |
| `pnpm lint` / `pnpm format` | ESLint (type-aware) / Prettier                            |
| `pnpm typecheck`            | tsc across the workspace                                  |
| `pnpm build`                | compile `packages/shared` then `apps/server` to `dist/`   |
| `pnpm db:generate`          | generate a migration from `apps/server/src/db/schema.ts`  |
| `pnpm db:migrate`           | apply migrations to `DATABASE_URL`                        |

````

`CLAUDE.md` (root):
```md
# Tectonic Desk

Earth-sciences dashboard for a reader with formal geology training. Earthquakes now, volcanoes next, space weather considered later. Write copy and drill-down depth for a peer, not a novice.

## Repo rules
- `quake/` is the frozen prototype. Never modify it. Its `CLAUDE.md` holds the verified focal-mechanism conventions and USGS endpoint notes; consult it, do not edit it.
- pnpm workspace: `apps/server` (Fastify, Drizzle, Postgres), `apps/web` (Vue, later), `packages/shared` (domain types only, no runtime deps).
- Specs live in `docs/superpowers/specs`, plans in `docs/superpowers/plans`. Each sub-project (Foundation, Ingest, API, Front end) gets its own.
- TypeScript strict, ESM, NodeNext. Imports of local files use the `.js` extension.
- Repositories are plain functions taking a `Db` first. No classes, no singletons.
- Server coverage thresholds are 100%. Add a test rather than lowering them.
- Postgres dev container is on host port 5433 (5432 is taken on the dev machine).
- Migrations are generated by drizzle-kit into `apps/server/drizzle/migrations` and checked in. Never hand-edit a generated migration; change the schema and regenerate.

## Commands
`pnpm test`, `pnpm test:coverage`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:up`, `pnpm db:migrate`, `pnpm dev`.
````

- [ ] **Step 4: Final verification and commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build
git status --short      # confirm .env is not listed
git add -A
git commit -m "docs: README and CLAUDE.md for the live build"
```

---

## Self-review

- **Spec coverage**: layout (T1), toolchain and config (T1, T2), schema with all columns, indexes, unique key and check (T3), repository functions with revision guard, last_seen bump, bbox, limit clamp (T5, T6), health route and buildApp injection (T7), Testcontainers with Docker skip (T3), coverage thresholds (T1, T7), lint (T1), docs (T8). Deviation recorded: migrations folder location.
- **Placeholders**: none.
- **Type consistency**: `Db`, `TestDb`, `startPostgres`, `dockerAvailable`, `makeEvent`, `makeMechanism`, `rowToEvent`, `eventToRow`, `rowToMechanism`, `mechanismToRow`, `upsertEvents`, `listEvents`, `getEvent`, `upsertMechanism`, `buildApp`, `buildLoggerOptions`, `loadConfig`, `ConfigError` are used with the same names and signatures throughout.
