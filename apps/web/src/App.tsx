import { Navigate, Route, Routes } from "react-router-dom";
import { authClient } from "./lib/auth-client";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";

export function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <main className="page">Loading…</main>;
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
