import { useEffect, useState } from "react";
import type { StravaAthlete } from "@repo/shared";
import { authClient } from "../lib/auth-client";

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
    <main className="page">
      <div className="card">
        <header className="profile-header">
          {session?.user.image && (
            <img className="avatar" src={session.user.image} alt="" />
          )}
          <div>
            <h1>{session?.user.name}</h1>
            <p className="muted">Signed in with Strava</p>
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {!athlete && !error && <p>Loading your Strava profile…</p>}

        {athlete && (
          <dl className="facts">
            <div>
              <dt>Athlete ID</dt>
              <dd>{athlete.id}</dd>
            </div>
            {athlete.username && (
              <div>
                <dt>Username</dt>
                <dd>{athlete.username}</dd>
              </div>
            )}
            {(athlete.city || athlete.country) && (
              <div>
                <dt>Location</dt>
                <dd>{[athlete.city, athlete.state, athlete.country].filter(Boolean).join(", ")}</dd>
              </div>
            )}
            {athlete.sex && (
              <div>
                <dt>Sex</dt>
                <dd>{athlete.sex}</dd>
              </div>
            )}
            {athlete.weight != null && athlete.weight > 0 && (
              <div>
                <dt>Weight</dt>
                <dd>{athlete.weight} kg</dd>
              </div>
            )}
            <div>
              <dt>Subscription</dt>
              <dd>{athlete.summit || athlete.premium ? "Strava subscriber" : "Free plan"}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{new Date(athlete.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
        )}

        <button className="signout-button" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}
