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
