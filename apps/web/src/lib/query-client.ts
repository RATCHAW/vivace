import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/api";

export const queryClient = new QueryClient({
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
