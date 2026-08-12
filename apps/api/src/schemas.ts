// The API's response contract. These schemas are the single source of truth:
// they validate/type the Hono handlers, they become the OpenAPI document served
// at /api/openapi.json, and apps/web generates its client + React Query hooks
// from that document. Change a schema here and `pnpm generate` propagates it.
//
// `z` must come from @hono/zod-openapi — it is Zod extended with `.openapi()`.
import { z } from "@hono/zod-openapi";

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
  })
  .openapi("Health");

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "Not signed in" }),
  })
  // Not "Error" — the generated client would shadow the global of that name.
  .openapi("ApiError");

/**
 * The athlete profile we hand to the browser.
 *
 * A deliberate subset of Strava's `DetailedAthlete` — the app only ever shows
 * these fields, and narrowing here keeps the OpenAPI document (and therefore
 * the generated web client) honest about what the UI can rely on.
 */
export const AthleteSchema = z
  .object({
    id: z.number().int().openapi({ example: 1234567 }),
    username: z.string().nullable().openapi({ example: "marianne_t" }),
    firstname: z.string().openapi({ example: "Marianne" }),
    lastname: z.string().openapi({ example: "Teutenberg" }),
    bio: z.string().nullable(),
    city: z.string().nullable().openapi({ example: "San Francisco" }),
    state: z.string().nullable().openapi({ example: "CA" }),
    country: z.string().nullable().openapi({ example: "US" }),
    sex: z.enum(["M", "F"]).nullable(),
    /** True while the athlete has a paid Strava subscription. */
    premium: z.boolean(),
    /** Strava's newer name for the same thing; both are returned. */
    summit: z.boolean(),
    created_at: z.iso.datetime().openapi({ example: "2017-11-14T02:30:05Z" }),
    updated_at: z.iso.datetime(),
    /** Large profile picture URL. */
    profile: z.string(),
    /** Small profile picture URL. */
    profile_medium: z.string(),
    /** Kilograms, or null when the athlete hasn't set one. */
    weight: z.number().nullable(),
  })
  .openapi("Athlete");

export type Athlete = z.infer<typeof AthleteSchema>;
