// better-auth owns four tables (user, session, account, verification) and used
// to get them from `better-auth migrate`, run as a Coolify pre-deployment
// command inside the freshly built container. The hardened production image
// carries neither pnpm nor that CLI — corepack is disabled and removed, and the
// install is `--prod`, so the devDependency holding the binary is not there —
// which is why the pre-deployment step started failing with exit 127.
//
// So the migration runs here instead, out of `better-auth` itself: a runtime
// dependency, therefore in the image by definition. The app's own tables have
// always been created idempotently on first use (see chat-store.ts and
// render-store.ts); this is the same bargain, made by the library rather than
// by hand.
import { getMigrations } from "better-auth/db/migration";
import { auth } from "./auth.js";
import { logger } from "./logger.js";

/**
 * Bring better-auth's tables up to the schema the running code expects.
 *
 * Fails closed. A process that binds the port against the wrong schema reads as
 * healthy while answering every sign-in with a 500, which is the failure this
 * is meant to prevent — so the caller must run it before `serve`, not beside it.
 */
export async function runAuthMigrations(): Promise<void> {
  const startedAt = performance.now();

  try {
    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);

    // A table can be in both lists — created here, extended there — and the
    // log line is about which tables moved, not how many statements ran.
    const tables = [...new Set([...toBeCreated, ...toBeAdded].map((m) => m.table))];

    if (tables.length === 0) {
      logger.info(
        { event: "db.migration_skipped" },
        "Auth schema already matches the running code",
      );
      return;
    }

    await runMigrations();

    logger.info(
      {
        event: "db.migrated",
        tables,
        durationMs: Math.round(performance.now() - startedAt),
      },
      `Migrated ${tables.length} auth table(s)`,
    );
  } catch (err) {
    // Logged for the specific event name, rethrown because the handler that
    // `installProcessLogging` puts on unhandledRejection is what flushes Loki
    // and PostHog before exiting non-zero. Exiting here would drop both.
    logger.fatal({ event: "db.migration_failed", err }, "Auth schema migration failed");
    throw err;
  }
}
