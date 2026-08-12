import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

// Same-origin in dev (Vite proxies /api to the Hono server) and in Docker (nginx does).
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
