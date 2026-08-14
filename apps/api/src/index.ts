import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { installProcessLogging, logger } from "./logger.js";
import { runAuthMigrations } from "./migrate.js";
import { posthogEnabled, shutdownPostHog } from "./posthog.js";

installProcessLogging({ flush: shutdownPostHog });

const port = Number(process.env.PORT ?? 3000);

// Before the port is bound, not alongside it. This used to be a deployment step
// outside the image; keeping it in front of `serve` preserves the ordering that
// step guaranteed — no request is served against a schema that isn't ready.
await runAuthMigrations();

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(
    {
      event: "server.started",
      port: info.port,
      // Absent means logs stay on stdout only — worth seeing at boot rather
      // than wondering later why Grafana is empty.
      loki: Boolean(process.env.LOKI_URL),
      posthog: posthogEnabled,
    },
    `API listening on http://localhost:${info.port}`,
  );
});
