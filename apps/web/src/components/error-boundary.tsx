import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { trackError } from "@/lib/logger";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * The fallback, split out because the boundary itself has to be a class and a
 * class cannot call `useTranslation`. Cheaper than the `withTranslation` HOC,
 * and it keeps the crash screen following a language change like everything
 * else does.
 */
function CrashScreen() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="flex max-w-sm flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>{t("errorBoundary.title")}</AlertTitle>
          <AlertDescription>{t("errorBoundary.body")}</AlertDescription>
        </Alert>
        <Button onClick={() => window.location.reload()}>
          {t("errorBoundary.reload")}
        </Button>
      </div>
    </main>
  );
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * The last line of defence: a render crash blanks the whole app, and React
 * reports it to nothing but a class component's `componentDidCatch`. Without
 * this the user sees a white screen and Grafana sees nothing at all.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    trackError("ui.render_crashed", error, {
      // Which tree blew up — the one thing the stack alone doesn't say.
      componentStack: info.componentStack?.slice(0, 1_000) ?? null,
    });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return <CrashScreen />;
  }
}
