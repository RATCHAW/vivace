import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { installClientLogging } from "@/lib/logger";
import { initPostHog } from "@/lib/posthog";
import { queryClient } from "@/lib/query-client";
import { currentLocale } from "@/i18n";
import "./styles.css";

// Before the first render, so a crash on the way up is still reported — and so
// the first pageview is captured rather than missed.
initPostHog();
installClientLogging();

// i18next initialises synchronously on import, so by here the language is
// already resolved — `index.html` ships `lang="en"` and this is what corrects
// it for a French athlete before anything is read out.
document.documentElement.lang = currentLocale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <BrowserRouter>
            <App />
            <Toaster />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
