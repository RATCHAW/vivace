import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { flushClientLogs, trackEvent } from "@/lib/logger";
import { resetPostHog } from "@/lib/posthog";
import { Wordmark } from "@/components/wordmark";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** The three surfaces, by route. The label is a key — see `nav` in the
 *  catalogue — because this array is module-level and `t` is not. */
const NAV = [
  { to: "/", label: "nav.overview" },
  { to: "/runs", label: "nav.activities" },
  { to: "/coach", label: "nav.coach" },
] as const;

/** The signed-in chrome: wordmark, the three surfaces, and who you are.
 *  A hairline rule carries it — DESIGN.md has no elevation shadows. */
export function AppHeader() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: session } = authClient.useSession();
  const name = session?.user.name ?? "";

  return (
    <header className="flex h-16 items-center gap-4 border-b px-8 sm:gap-8">
      <Link to="/" aria-label={t("nav.home")}>
        <Wordmark />
      </Link>

      <nav className="flex items-center gap-1.5">
        {NAV.map((item) => (
          <Button
            key={item.to}
            size="sm"
            variant={pathname === item.to ? "secondary" : "ghost"}
            className={
              pathname === item.to ? undefined : "text-muted-foreground"
            }
            aria-current={pathname === item.to ? "page" : undefined}
            render={<Link to={item.to} />}
          >
            {t(item.label)}
          </Button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span className="ph-no-capture text-body-sm text-muted-foreground hidden md:inline">
          {name}
        </span>
        <Avatar className="ph-no-capture">
          <AvatarImage src={session?.user.image ?? undefined} alt="" />
          <AvatarFallback>{name.charAt(0).toUpperCase() || "?"}</AvatarFallback>
        </Avatar>
        <LanguageToggle />
        <ModeToggle />
        <Button
          size="sm"
          variant="subtle"
          className="hidden sm:inline-flex"
          onClick={() => {
            trackEvent("auth.sign_out");
            // Flush while the cookie is still ours to attribute the batch by.
            flushClientLogs();
            // The next athlete on this browser must not inherit this person.
            resetPostHog();
            void authClient.signOut();
          }}
        >
          {t("nav.signOut")}
        </Button>
      </div>
    </header>
  );
}
