import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { StravaIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Welcome</CardTitle>
          <CardDescription>Sign in to see your Strava profile.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button
            size="lg"
            className="w-full bg-strava text-strava-foreground hover:bg-strava-hover"
            onClick={signInWithStrava}
          >
            <StravaIcon />
            Continue with Strava
          </Button>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
