import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MenuIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { flushClientLogs, trackEvent } from "@/lib/logger";
import { resetPostHog } from "@/lib/posthog";
import { Wordmark } from "@/components/wordmark";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** The three surfaces, by route. The label is a key — see `nav` in the
 *  catalogue — because this array is module-level and `t` is not. */
const NAV = [
  { to: "/", label: "nav.overview" },
  { to: "/runs", label: "nav.activities" },
  { to: "/coach", label: "nav.coach" },
] as const;

/** Leaving, in the order the leaving has to happen in. */
function signOut() {
  trackEvent("auth.sign_out");
  // Flush while the cookie is still ours to attribute the batch by.
  flushClientLogs();
  // The next athlete on this browser must not inherit this person.
  resetPostHog();
  void authClient.signOut();
}

/**
 * The same three surfaces, plus the preferences that sit beside them, for a
 * width that cannot hold a row of them.
 *
 * The whole header used to render at every width, which at a phone's is wider
 * than the phone: the wordmark, three pills, a name, an avatar and three
 * controls overflowed, and an overflowing header makes the *document* scroll
 * sideways — every page, not just this one.
 */
function MobileMenu() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={
          <Button aria-label={t("nav.menu")} size="icon-sm" variant="ghost" />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{t("nav.menu")}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                aria-current={pathname === item.to ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 text-body-lg flex h-12 items-center rounded-md px-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-inset",
                  pathname === item.to
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/40",
                )}
                key={item.to}
                onClick={() => setOpen(false)}
                to={item.to}
              >
                {t(item.label)}
              </Link>
            ))}
          </nav>

          <div className="border-border flex items-center gap-1 border-t pt-4">
            <LanguageToggle />
            <ModeToggle />
            <Button
              className="ml-auto"
              onClick={signOut}
              size="sm"
              variant="subtle"
            >
              {t("nav.signOut")}
            </Button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** The signed-in chrome: wordmark, the three surfaces, and who you are.
 *  A hairline rule carries it — DESIGN.md has no elevation shadows. */
export function AppHeader() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: session } = authClient.useSession();
  const name = session?.user.name ?? "";

  return (
    <header className="flex h-16 items-center gap-3 border-b px-4 sm:gap-8 sm:px-8">
      <Link to="/" aria-label={t("nav.home")} className="shrink-0">
        <Wordmark />
      </Link>

      <nav className="hidden items-center gap-1.5 md:flex">
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

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className="ph-no-capture text-body-sm text-muted-foreground hidden md:inline">
          {name}
        </span>
        <Avatar className="ph-no-capture">
          <AvatarImage src={session?.user.image ?? undefined} alt="" />
          <AvatarFallback>{name.charAt(0).toUpperCase() || "?"}</AvatarFallback>
        </Avatar>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageToggle />
          <ModeToggle />
          <Button onClick={signOut} size="sm" variant="subtle">
            {t("nav.signOut")}
          </Button>
        </div>

        <div className="md:hidden">
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
