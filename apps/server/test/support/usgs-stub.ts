import type { FeedKind, QueryParams, UsgsClient } from "../../src/usgs/client.js";
import type { DetailDocument, FeedDocument } from "../../src/usgs/schema.js";

export interface StubOptions {
  feeds?: Partial<Record<FeedKind, FeedDocument | Error>>;
  details?: Record<string, DetailDocument | Error>;
  query?: (p: QueryParams) => FeedDocument;
}

export interface StubUsgs extends UsgsClient {
  calls: { feed: FeedKind[]; detail: string[]; query: QueryParams[] };
}

const settle = <T>(v: T | Error | undefined, what: string): Promise<T> => {
  if (v === undefined) return Promise.reject(new Error(`stub has no ${what}`));
  if (v instanceof Error) return Promise.reject(v);
  return Promise.resolve(v);
};

export function stubUsgs(opts: StubOptions = {}): StubUsgs {
  const calls: StubUsgs["calls"] = { feed: [], detail: [], query: [] };
  return {
    calls,
    fetchFeed: (kind) => {
      calls.feed.push(kind);
      return settle(opts.feeds?.[kind], `feed ${kind}`);
    },
    fetchDetail: (id) => {
      calls.detail.push(id);
      return settle(opts.details?.[id], `detail ${id}`);
    },
    fetchQuery: (p) => {
      calls.query.push(p);
      return opts.query
        ? Promise.resolve(opts.query(p))
        : Promise.reject(new Error("stub has no query"));
    },
  };
}
