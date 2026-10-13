import type { FastifyReply } from "fastify";

export function cacheFor(reply: FastifyReply, seconds: number): void {
  void reply.header("cache-control", `public, max-age=${String(seconds)}`);
}
