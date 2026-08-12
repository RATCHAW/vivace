import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { StravaIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// DESIGN.md {component.hero-band-dark}: a full-bleed band, display type, and a
// single {component.button-primary} pill as the loudest pixel on the canvas.
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
    <main className="flex min-h-svh items-center justify-center px-6 py-30">
      <div className="flex w-full max-w-[1200px] flex-col items-center gap-8 text-center">
        <div className="flex max-w-2xl flex-col gap-4">
          <h1 className="font-heading text-display-xl text-balance">Welcome</h1>
          <p className="text-body-lg text-muted-foreground text-balance">
            Sign in to see your Strava profile.
          </p>
        </div>

        <Button size="lg" onClick={signInWithStrava}>
          <StravaIcon className="text-strava" />
          Continue with Strava
        </Button>

        {error && (
          <Alert variant="destructive" className="max-w-sm text-left">
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}
