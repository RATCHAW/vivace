// The typed API surface for the app. Everything under ./generated comes from
// apps/api/openapi.json via @hey-api/openapi-ts — don't hand-edit it, run
// `pnpm generate` at the repo root instead.
//
// Import from `@/api`, not from the generated files directly, so the client is
// configured and its errors are normalised before the first request goes out.

import { client } from "./generated/client.gen";
import type { ApiError } from "./generated/types.gen";

client.setConfig({
  // Same-origin: Vite proxies /api to the Hono server in dev, nginx in Docker.
  baseUrl: "/",
  // Send the better-auth session cookie.
  credentials: "include",
});

/**
 * A failed request, with the status attached.
 *
 * The generated client throws the parsed response body as-is — for us that's
 * the OpenAPI `ApiError` schema, `{ error: string }` — which loses the status
 * and isn't an `Error`. An error interceptor wraps every failure in this so
 * React Query can tell a dead session (401, don't retry) from a flaky upstream.
 * It still implements `ApiError`, which is what the generated query options
 * declare as their error type, so callers can read `.error` either way.
 */
export class ApiRequestError extends Error implements ApiError {
  readonly error: string;

  constructor(
    readonly status: number,
    body: unknown,
  ) {
    const message = describe(status, body);
    super(message);
    this.name = "ApiRequestError";
    this.error = message;
  }
}

function describe(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  return status ? `Request failed (${status})` : "Network request failed";
}

client.interceptors.error.use(
  (error, response: Response | undefined) =>
    new ApiRequestError(response?.status ?? 0, error),
);

export { client };
export * from "./generated/@tanstack/react-query.gen";
export type { Athlete, ApiError, Run, RunStreams } from "./generated/types.gen";
