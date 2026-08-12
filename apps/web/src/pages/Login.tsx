import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { StravaIcon } from "@/components/icons";
import { MonoLabel } from "@/components/mono";
import { Wordmark } from "@/components/wordmark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// DESIGN.md {component.hero-band-dark}: a full-bleed band, display type, and a
// single {component.button-primary} pill as the loudest pixel on the canvas.
// Facing it, the thing being sold — one 9:16 replay, standing on its own plate.
export function Login() {
  const [error, setError] = useState<string | null>(null);

  async function signInWithStrava() {
    setError(null);
    const { error } = await authClient.signIn.oauth2({
      providerId: "strava",
      callbackURL: `${window.location.origin}/`,
      errorCallbackURL: `${window.location.origin}/login`,
    });
    if (error) setError(error.message ?? "Sign-in failed");
  }

  return (
    <main className="grid min-h-svh items-stretch lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-16 px-6 py-12 sm:px-18 sm:py-14">
        <Wordmark size="lg" />

        <div className="flex max-w-[520px] flex-col gap-8">
          <h1 className="font-heading text-display-xl text-balance">
            Every run,
            <br />
            a story.
          </h1>
          <p className="text-body-lg text-muted-foreground max-w-[420px] text-balance">
            Your Strava activities, replayed as a vertical film you can watch and
            share. Nothing to log, nothing to set up.
          </p>

          <div className="flex flex-col items-start gap-4">
            <Button size="lg" onClick={signInWithStrava}>
              <StravaIcon className="text-strava" />
              Continue with Strava
            </Button>
            <span className="text-caption text-stone">
              Strava is the only way in. We never post on your behalf.
            </span>
          </div>

          {error && (
            <Alert variant="destructive" className="max-w-sm">
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="text-caption text-stone flex gap-6">
          <span>Runs today</span>
          <span className="opacity-60">Rides, lifts &amp; swims soon</span>
        </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden border-l bg-muted/40 p-12 lg:flex">
        {/* Graph paper, not a shadow: the plate reads as a different surface
            because of the rule and the ruling, not because it floats. */}
        <div
          aria-hidden
          className="absolute inset-0 [background-image:repeating-linear-gradient(0deg,var(--border)_0_1px,transparent_1px_30px),repeating-linear-gradient(90deg,var(--border)_0_1px,transparent_1px_30px)]"
        />
        {/* A still of the thing itself. Black and white are literal here for the
            same reason they are in the composition: a replay is a replay in
            either theme. */}
        <div className="relative flex aspect-9/16 w-[360px] flex-col justify-end overflow-hidden rounded-xl border bg-black p-7 pb-9 text-white">
          <div
            aria-hidden
            className="from-brand/25 absolute inset-0 bg-radial-[at_50%_35%] to-transparent to-70%"
          />
          <div className="relative flex flex-col gap-3.5">
            <MonoLabel>9:16 replay</MonoLabel>
            <span className="text-display-lg font-semibold">
              3.16
              <span className="text-body-lg ml-2 font-medium tracking-[0.08em] text-white/70">
                KM
              </span>
            </span>
            <div className="h-px bg-white/15" />
            <span className="text-caption text-white/70">
              Evening Run · Aug 5, 2026
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
