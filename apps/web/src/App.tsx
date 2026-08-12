import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
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
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading…</span>
    </main>
  );
}

export function App() {
  const { data: session, isPending } = authClient.useSession();

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
