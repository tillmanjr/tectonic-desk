import type { ApiError, ApiSunMovie, GeneratedMovie } from "@tectonic/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";
import { MovieRequestError, type SunMovieCache } from "../../src/space/sun-movies.js";

const db = {} as unknown as Db;
const MOVIE: GeneratedMovie = {
  key: "aia193",
  size: 512,
  from: new Date("2026-11-16T00:00:00Z"),
  to: new Date("2026-11-17T00:00:00Z"),
  state: "building",
  progress: 40,
  url: null,
};
const QUERY = "from=2026-11-16T00:00:00Z&to=2026-11-17T00:00:00Z";

function cacheAnswering(answer: SunMovieCache["get"]): SunMovieCache {
  return { get: answer };
}

describe("GET /api/space/sun/:key/movie", () => {
  it("answers a building movie uncached and a ready one cached an hour, 512 px by default", async () => {
    const asked: unknown[][] = [];
    let movie = MOVIE;
    const app = buildApp({
      db,
      sunMovies: cacheAnswering((...args) => {
        asked.push(args);
        return Promise.resolve(movie);
      }),
    });
    const building = await app.inject({
      method: "GET",
      url: `/api/space/sun/aia193/movie?${QUERY}`,
    });
    expect(building.statusCode).toBe(200);
    expect(building.headers["cache-control"]).toBe("public, max-age=0");
    expect(building.json<ApiSunMovie>()).toEqual({
      ...MOVIE,
      from: "2026-11-16T00:00:00.000Z",
      to: "2026-11-17T00:00:00.000Z",
    });
    expect(asked[0]).toEqual(["aia193", MOVIE.from, MOVIE.to, 512]);
    movie = { ...MOVIE, size: 1024, state: "ready", progress: null, url: "https://h/m.mp4" };
    const ready = await app.inject({
      method: "GET",
      url: `/api/space/sun/aia193/movie?${QUERY}&size=1024`,
    });
    expect(ready.headers["cache-control"]).toBe("public, max-age=3600");
    expect(ready.json<ApiSunMovie>().url).toBe("https://h/m.mp4");
    expect(asked[1]?.[3]).toBe(1024);
    await app.close();
  });

  it("404s an unknown channel and 400s a bad query, size or span", async () => {
    const app = buildApp({
      db,
      sunMovies: cacheAnswering(() =>
        Promise.reject(new MovieRequestError("the span may be at most 30 days")),
      ),
    });
    const unknown = await app.inject({
      method: "GET",
      url: `/api/space/sun/aia999/movie?${QUERY}`,
    });
    expect(unknown.statusCode).toBe(404);
    for (const q of ["from=soon&to=later", `${QUERY}&size=640`, `${QUERY}&extra=1`]) {
      const res = await app.inject({ method: "GET", url: `/api/space/sun/c2/movie?${q}` });
      expect(res.statusCode, q).toBe(400);
    }
    const long = await app.inject({ method: "GET", url: `/api/space/sun/c2/movie?${QUERY}` });
    expect(long.statusCode).toBe(400);
    expect(long.json<ApiError>().issues?.[0]?.message).toBe("the span may be at most 30 days");
    await app.close();
  });

  it("502s when the build failed", async () => {
    const app = buildApp({
      db,
      sunMovies: cacheAnswering(() => Promise.reject(new Error("encoder died"))),
    });
    const res = await app.inject({ method: "GET", url: `/api/space/sun/c3/movie?${QUERY}` });
    expect(res.statusCode).toBe(502);
    expect(res.json<ApiError>().error).toBe("the movie could not be built");
    await app.close();
  });

  it("builds a default cache when none is given", () => {
    const app = buildApp({ db });
    expect(typeof app.sunMovies.get).toBe("function");
    void app.close();
  });
});
