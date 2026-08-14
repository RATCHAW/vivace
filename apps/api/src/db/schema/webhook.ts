// The idempotency ledger for Strava's webhook deliveries.
import { bigint, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const stravaWebhookEvent = pgTable(
  "strava_webhook_event",
  {
    objectId: bigint("object_id", { mode: "number" }).notNull(),
    aspectType: text("aspect_type").notNull(),
    eventTime: bigint("event_time", { mode: "number" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Strava retries an unacknowledged event up to three times, and every retry is
  // byte-identical. This is what makes the work happen once.
  (table) => [
    primaryKey({
      columns: [table.objectId, table.aspectType, table.eventTime],
    }),
  ],
);
