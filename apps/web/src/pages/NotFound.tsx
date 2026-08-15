import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/logger";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { MonoLabel } from "@/components/mono";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";

/** The three surfaces, offered as a way back rather than chosen for them. */
const WAYS_BACK = [
  { to: "/", label: "nav.overview" },
  { to: "/replays", label: "nav.replays" },
  { to: "/coach", label: "nav.coach" },
] as const;

function Body() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center gap-8 px-6 py-24 sm:px-8">
      <div className="flex max-w-[520px] flex-col gap-5">
        <MonoLabel>{t("notFound.eyebrow")}</MonoLabel>
        <h1 className="font-heading text-display-lg text-balance">
          {t("notFound.title")}
        </h1>
        <p className="text-body-lg text-muted-foreground text-balance">
          {t("notFound.body")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {WAYS_BACK.map((way, index) => (
          <Button
            key={way.to}
            render={<Link to={way.to} />}
            variant={index === 0 ? "default" : "subtle"}
          >
            {t(way.label)}
          </Button>
        ))}
      </div>
    </main>
  );
}

/**
 * A dead link, said out loud.
 *
 * `*` used to `<Navigate to="/">`, which meant a stale replay link, a typo and
 * a renamed route all resolved to the Overview with nothing said — success at
 * the wrong address, which reads as the app having lost your place rather than
 * the address having been wrong.
 *
 * Signed out this is the one page that renders without the app chrome: the
 * header's nav would offer three surfaces that all bounce to sign-in.
 */
export function NotFound() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    trackEvent("ui.not_found", { path: window.location.pathname });
  }, []);

  if (!session) {
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex h-16 items-center border-b px-6 sm:px-8">
          <Link to="/" aria-label={t("nav.home")}>
            <Wordmark />
          </Link>
        </header>
        <Body />
      </div>
    );
  }

  return (
    <AppShell>
      <Body />
    </AppShell>
  );
}
