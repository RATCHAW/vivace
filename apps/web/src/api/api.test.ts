import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, client, getStravaAthleteOptions } from ".";

/** Stands in for the API, so the generated SDK is exercised for real. */
function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_request: Request) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  client.setConfig({
    // The app's "/" base URL relies on a document to resolve against; Node's
    // Request constructor wants an absolute one.
    baseUrl: "http://api.test",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return fetchMock;
}

/**
 * Runs the generated query options the way React Query would, minus the
 * abort signal — jsdom's `AbortSignal` isn't the one Node's `Request` accepts.
 */
function runQuery<T>(options: {
  queryKey: unknown;
  queryFn?: (context: never) => T | Promise<T>;
}): Promise<T> {
  return Promise.resolve(
    options.queryFn!({
      queryKey: options.queryKey,
      signal: undefined,
    } as never),
  );
}

describe("generated API client", () => {
  it("calls the documented path and returns typed data", async () => {
    const athlete = { id: 42, username: "marianne_t", firstname: "Marianne" };
    const fetchMock = mockFetch(200, athlete);

    const data = await runQuery(getStravaAthleteOptions());

    expect(data).toMatchObject(athlete);
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(new URL(fetchMock.mock.calls[0][0].url).pathname).toBe(
      "/api/me/strava",
    );
  });

  it("turns a failure into an ApiRequestError carrying the status", async () => {
    mockFetch(401, { error: "Not signed in" });

    const failure = runQuery(getStravaAthleteOptions());

    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({
      status: 401,
      error: "Not signed in",
      message: "Not signed in",
    });
  });
});
