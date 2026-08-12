import { useState } from "react";
import { authClient } from "../lib/auth-client";

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
    <main className="page">
      <div className="card">
        <h1>Welcome</h1>
        <p>Sign in to see your Strava profile.</p>
        <button className="strava-button" onClick={signInWithStrava}>
          Continue with Strava
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
