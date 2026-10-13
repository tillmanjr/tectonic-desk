import type { ApiError, ApiIssue } from "@tectonic/shared";
import type { FastifyInstance } from "fastify";

export class HttpError extends Error {
  readonly statusCode: number;
  readonly issues: ApiIssue[] | undefined;

  constructor(statusCode: number, message: string, issues?: ApiIssue[]) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.issues = issues;
  }
}

export const badRequest = (issues: ApiIssue[]): HttpError =>
  new HttpError(400, "invalid request", issues);

export const notFound = (message = "not found"): HttpError => new HttpError(404, message);

/** One error shape for every failure: `{ error, issues? }`. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "not found" }));
  app.setErrorHandler((err: unknown, request, reply) => {
    if (err instanceof HttpError) {
      const body: ApiError = { error: err.message };
      if (err.issues) body.issues = err.issues;
      return reply.code(err.statusCode).send(body);
    }
    request.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal error" });
  });
}
