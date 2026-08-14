import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { installProcessLogging, logger } from "./logger.js";
import { posthogEnabled, shutdownPostHog } from "./posthog.js";

installProcessLogging({ flush: shutdownPostHog });

const port = Number(process.env.PORT ?? 3000);

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
