import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getStravaAthleteOptions } from "@/api";
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

// DESIGN.md: hairline rules carry the row rhythm — no shadows, no zebra fills.
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-caption shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-body-sm min-w-0 text-right font-semibold break-words">
        {children}
      </dd>
    </div>
  );
}

export function Home() {
  const { data: session } = authClient.useSession();
  // Fully typed off the API's OpenAPI document — see apps/web/src/api.
  const { data: athlete, error } = useQuery(getStravaAthleteOptions());

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-22">
      {/* {component.feature-card-dark} / {component.feature-card-light} */}
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              <AvatarImage src={session?.user.image ?? undefined} alt="" />
              <AvatarFallback>
                {session?.user.name?.charAt(0).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="grid gap-1">
              <CardTitle>{session?.user.name}</CardTitle>
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
              <AlertDescription>{error.error}</AlertDescription>
            </Alert>
          )}

          {!athlete && !error && (
            <div
              className="divide-y divide-border"
              aria-label="Loading your Strava profile"
            >
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex justify-between gap-4 py-3">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            </div>
          )}

          {athlete && (
            <dl className="divide-y divide-border">
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
                  // {component.badge-feature} — the single cobalt stamp
                  <Badge className="bg-brand text-brand-foreground">
                    Strava subscriber
                  </Badge>
                ) : (
                  // {component.badge-tag}
                  <Badge variant="secondary">Free plan</Badge>
                )}
              </Fact>
              <Fact label="Member since">
                {new Date(athlete.created_at).toLocaleDateString()}
              </Fact>
            </dl>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3">
          {/* {component.button-primary} — the loudest pixel on the card */}
          <Button className="w-full" render={<Link to="/runs" />}>
            Watch your runs
          </Button>
          <Button variant="outline" className="w-full" onClick={() => authClient.signOut()}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
