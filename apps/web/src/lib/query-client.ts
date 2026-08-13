import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/api";
import { trackError } from "@/lib/logger";

/**
 * Every failed request in the app passes through here — the caches see errors
 * React Query has already retried and given up on. One hook beats a `logError`
 * in every `onError` callback, and it can't be forgotten by a new query.
 */
function reportFailure(event: string, operation: string, error: unknown): void {
  const status = error instanceof ApiRequestError ? error.status : 0;
  // A dead session is an expected outcome — it becomes the sign-in redirect.
  // Logging it as an error would bury the failures that mean something.
  if (status === 401) return;
  trackError(event, error, { operation, status });
}

/**
 * What to call the failing request in the logs. Generated query keys lead with
 * `{ _id: "getRuns", … }`; mutations have no generated key, so their call site
 * passes a plain `["startRunRender"]`.
 */
function operationOf(key: readonly unknown[]): string {
  const [head] = key;
  if (typeof head === "string") return head;
  if (head && typeof head === "object" && "_id" in head) {
    return String((head as { _id: unknown })._id);
  }
  return "unknown";
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) =>
      reportFailure("api.query_failed", operationOf(query.queryKey), error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      reportFailure(
        "api.mutation_failed",
        operationOf(mutation.options.mutationKey ?? []),
        error,
      ),
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // A 401 means the session is gone — retrying can't fix it.
      retry: (failureCount, error) =>
        !(error instanceof ApiRequestError && error.status === 401) &&
        failureCount < 2,
    },
  },
});
