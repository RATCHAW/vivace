import { lazy, Suspense, useEffect, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/logger";
import { signInPath } from "@/lib/next-path";
import { identifyAthlete } from "@/lib/posthog";
import { Login } from "@/pages/Login";
import { Home } from "@/pages/Home";
import { NotFound } from "@/pages/NotFound";

// Remotion + Mapbox are heavy — only load them when the replays page is visited.
const Replays = lazy(() =>
  import("@/pages/Replays").then((m) => ({ default: m.Replays })),
);

// So are the AI SDK and the markdown renderer behind the coach.
const Coach = lazy(() =>
  import("@/pages/Coach").then((m) => ({ default: m.Coach })),
);

function FullPageSpinner() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">{t("common.loading")}</span>
    </main>
  );
}

/**
 * A surface only a signed-in athlete may see.
 *
 * The redirect carries where they were going, so a shared replay link survives
 * the round trip through Strava instead of dropping everyone on the Overview —
 * see `next-path.ts`. `replace` matters: without it the back button walks into
 * the guard again and bounces straight back out.
 */
function Guarded({
  children,
  signedIn,
}: {
  children: ReactElement;
  signedIn: boolean;
}) {
  const location = useLocation();

  if (!signedIn) return <Navigate to={signInPath(location)} replace />;
  return <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>;
}

/**
 * One `ui.page_view` per navigation. The router never reloads the document, so
 * this is the only place a "which screens do people use" panel can come from.
 */
function usePageViews(signedIn: boolean, ready: boolean): void {
  const { pathname } = useLocation();

  useEffect(() => {
    // Until the session resolves every path renders the spinner, and half of
    // them are about to redirect — that's not a page view.
    if (!ready) return;
    trackEvent("ui.page_view", { path: pathname, signedIn });
  }, [pathname, signedIn, ready]);
}

/**
 * Names the athlete in PostHog, which stitches everything they did while
 * signed out — the landing page, the sign-in screen — onto the same person.
 */
function useIdentify(userId: string | undefined, name: string | null): void {
  useEffect(() => {
    if (userId) identifyAthlete(userId, name);
  }, [userId, name]);
}

export function App() {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session);

  usePageViews(signedIn, !isPending);
  useIdentify(session?.user.id, session?.user.name ?? null);

  if (isPending) {
    return <FullPageSpinner />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={signedIn ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <Guarded signedIn={signedIn}>
            <Home />
          </Guarded>
        }
      />
      <Route
        path="/replays"
        element={
          <Guarded signedIn={signedIn}>
            <Replays />
          </Guarded>
        }
      />
      {/* Every replay link shared before the rename points here. */}
      <Route path="/runs" element={<LegacyRunsRedirect />} />
      <Route
        path="/coach"
        element={
          <Guarded signedIn={signedIn}>
            <Coach />
          </Guarded>
        }
      />
      {/* A page, not a silent bounce to the Overview: a stale or mistyped link
          that quietly succeeds at the wrong address is indistinguishable from
          the app losing the athlete's place. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/** `/runs?run=123` → `/replays?run=123`, query intact. */
function LegacyRunsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/replays${search}`} replace />;
}
