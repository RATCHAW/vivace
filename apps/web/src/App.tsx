import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/logger";
import { identifyAthlete } from "@/lib/posthog";
import { Login } from "@/pages/Login";
import { Home } from "@/pages/Home";

// Remotion + Mapbox are heavy — only load them when the runs page is visited.
const Runs = lazy(() =>
  import("@/pages/Runs").then((m) => ({ default: m.Runs })),
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

  usePageViews(Boolean(session), !isPending);
  useIdentify(session?.user.id, session?.user.name ?? null);

  if (isPending) {
    return <FullPageSpinner />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/"
        element={session ? <Home /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/runs"
        element={
          session ? (
            <Suspense fallback={<FullPageSpinner />}>
              <Runs />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/coach"
        element={
          session ? (
            <Suspense fallback={<FullPageSpinner />}>
              <Coach />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
