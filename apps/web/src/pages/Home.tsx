import { useEffect, useState, type ReactNode } from "react";
import type { StravaAthlete } from "@repo/shared";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ModeToggle } from "@/components/mode-toggle";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function Home() {
  const { data: session } = authClient.useSession();
  const [athlete, setAthlete] = useState<StravaAthlete | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/strava", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
        setAthlete(await res.json());
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={session?.user.image ?? undefined} alt="" />
              <AvatarFallback>
                {session?.user.name?.charAt(0).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="grid gap-0.5">
              <CardTitle className="text-lg">{session?.user.name}</CardTitle>
              <CardDescription>Signed in with Strava</CardDescription>
            </div>
          </div>
          <CardAction>
            <ModeToggle />
          </CardAction>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not load your profile</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!athlete && !error && (
            <div className="grid gap-4" aria-label="Loading your Strava profile">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="grid gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </div>
          )}

          {athlete && (
            <dl className="grid gap-3">
              <Fact label="Athlete ID">{athlete.id}</Fact>
              {athlete.username && (
                <Fact label="Username">{athlete.username}</Fact>
              )}
              {(athlete.city || athlete.country) && (
                <Fact label="Location">
                  {[athlete.city, athlete.state, athlete.country]
                    .filter(Boolean)
                    .join(", ")}
                </Fact>
              )}
              {athlete.sex && <Fact label="Sex">{athlete.sex}</Fact>}
              {athlete.weight != null && athlete.weight > 0 && (
                <Fact label="Weight">{athlete.weight} kg</Fact>
              )}
              <Fact label="Subscription">
                {athlete.summit || athlete.premium ? (
                  <Badge className="bg-strava text-strava-foreground">
                    Strava subscriber
                  </Badge>
                ) : (
                  <Badge variant="secondary">Free plan</Badge>
                )}
              </Fact>
              <Fact label="Member since">
                {new Date(athlete.created_at).toLocaleDateString()}
              </Fact>
            </dl>
          )}
        </CardContent>

        <CardFooter>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => authClient.signOut()}
          >
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
