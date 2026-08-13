import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { installProcessLogging, logger } from "./logger.js";

installProcessLogging();

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(
    {
      event: "server.started",
      port: info.port,
      // Absent means logs stay on stdout only — worth seeing at boot rather
      // than wondering later why Grafana is empty.
      loki: process.env.LOKI_URL ?? null,
    },
    `API listening on http://localhost:${info.port}`,
  );
});
