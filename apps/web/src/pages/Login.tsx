import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { trackError, trackEvent } from "@/lib/logger";
import { NEXT_PARAM, safeNextPath } from "@/lib/next-path";
import { StravaIcon } from "@/components/icons";
import { LanguageToggle } from "@/components/language-toggle";
import { MonoLabel } from "@/components/mono";
import { Wordmark } from "@/components/wordmark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// DESIGN.md {component.hero-band-dark}: a full-bleed band, display type, and a
// single {component.button-primary} pill as the loudest pixel on the canvas.
// Facing it, the thing being sold — one 9:16 replay, standing on its own plate.
export function Login() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const signInStarted = useRef(false);

  async function signInWithStrava() {
    if (signInStarted.current) return;
    signInStarted.current = true;
    setError(null);

    // Where the athlete was headed before the guard sent them here — a shared
    // replay, or the coach from the landing page. Sanitised rather than
    // trusted: this value reaches an OAuth `callbackURL`, and the sign-in
    // screen is the worst possible place to host an open redirect.
    const next = safeNextPath(
      new URL(window.location.href).searchParams.get(NEXT_PARAM),
    );

    // The redirect to Strava happens next, so this is the last thing we can
    // record on our side — an athlete who never comes back shows up as a
    // sign-in started with no session created after it.
    trackEvent("auth.sign_in_started", { provider: "strava", next });

    const { error } = await authClient.signIn.oauth2({
      providerId: "strava",
      callbackURL: `${window.location.origin}${next}`,
      errorCallbackURL: `${window.location.origin}/login`,
    });
    if (error) {
      signInStarted.current = false;
      // The message comes off the wire in whatever language the auth server
      // speaks; only our own fallback is ours to translate.
      const message = error.message ?? t("login.failedFallback");
      trackError("auth.sign_in_failed", message, {
        provider: "strava",
        status: error.status ?? null,
      });
      setError(message);
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("provider") !== "strava") return;

    // Consume the landing-page intent before leaving. If OAuth returns an
    // error, or the athlete refreshes before the redirect finishes, this page
    // remains a safe manual retry instead of immediately redirecting again.
    url.searchParams.delete("provider");
    window.history.replaceState(window.history.state, "", url);
    // Deliberately mount-only, and deliberately not a dependency: this consumes
    // a one-shot URL param handed over by the landing page. Re-running it when
    // `signInWithStrava` changed identity would start a second OAuth redirect.
    // The rule sees a possible synchronous setState; the only setState in here
    // is on the error path, after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void signInWithStrava();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-svh items-stretch lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-16 px-6 py-12 sm:px-18 sm:py-14">
        {/* The only screen with no AppHeader, so the language picker has to
            stand beside the wordmark — a French athlete who arrives here
            otherwise has nowhere to say so. */}
        <div className="flex items-center justify-between gap-4">
          <Wordmark size="lg" />
          <LanguageToggle />
        </div>

        <div className="flex max-w-[520px] flex-col gap-8">
          <h1 className="font-heading text-display-xl text-balance">
            {t("login.titleLine1")}
            <br />
            {t("login.titleLine2")}
          </h1>
          <p className="text-body-lg text-muted-foreground max-w-[420px] text-balance">
            {t("login.body")}
          </p>

          <div className="flex flex-col items-start gap-4">
            <Button size="lg" onClick={signInWithStrava}>
              <StravaIcon className="text-strava" />
              {t("login.continueWithStrava")}
            </Button>
            <span className="text-caption text-stone">
              {t("login.footnote")}
            </span>
          </div>

          {error && (
            <Alert variant="destructive" className="max-w-sm">
              <AlertTitle>{t("login.failedTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="text-caption text-stone flex gap-6">
          <span>{t("login.runsToday")}</span>
          <span className="opacity-60">{t("login.moreSoon")}</span>
        </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden border-l bg-muted/40 p-12 lg:flex">
        {/* Graph paper, not a shadow: the plate reads as a different surface
            because of the rule and the ruling, not because it floats. */}
        <div
          aria-hidden
          className="absolute inset-0 [background-image:repeating-linear-gradient(0deg,var(--border)_0_1px,transparent_1px_30px),repeating-linear-gradient(90deg,var(--border)_0_1px,transparent_1px_30px)]"
        />
        {/* A still of the thing itself. Black and white are literal here for the
            same reason they are in the composition: a replay is a replay in
            either theme. */}
        <div className="relative flex aspect-9/16 w-[360px] flex-col justify-end overflow-hidden rounded-xl border bg-black p-7 pb-9 text-white">
          <div
            aria-hidden
            className="from-brand/25 absolute inset-0 bg-radial-[at_50%_35%] to-transparent to-70%"
          />
          <div className="relative flex flex-col gap-3.5">
            <MonoLabel>{t("login.plateLabel")}</MonoLabel>
            <span className="text-display-lg font-semibold">
              3.16
              <span className="text-body-lg ml-2 font-medium tracking-[0.08em] text-white/70">
                KM
              </span>
            </span>
            <div className="h-px bg-white/15" />
            <span className="text-caption text-white/70">
              {t("login.plateCaption")}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
