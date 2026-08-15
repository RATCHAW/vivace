import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  LanguagesIcon,
  LifeBuoyIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";
import { flushClientLogs, trackEvent } from "@/lib/logger";
import { resetPostHog } from "@/lib/posthog";
import { contentPageUrl } from "@/lib/site";
import { changeLocale, currentLocale } from "@/i18n";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/locales";
import { Wordmark } from "@/components/wordmark";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { to: "/replays", label: "nav.replays" },
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
 * Who you are, and the three preferences that belong to you rather than to the
 * page: language, theme, and leaving.
 *
 * These used to sit loose in the header — a languages button, a sun, and a
 * Sign out pill, on every screen. Three permanent targets for things an
 * athlete touches once, beside three that are the actual navigation, which
 * made the row read as six equal choices. Behind the avatar they read as what
 * they are, and the header goes from eight targets to five.
 *
 * Help points at the marketing site's About page, which is also how the Coach
 * — the one surface with no footer — reaches the privacy and terms pages.
 */
function AccountMenu({ image, name }: { image?: string; name: string }) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const locale = currentLocale();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  const selectLocale = (next: Locale) => {
    if (next === locale) return;
    changeLocale(next);
    trackEvent("ui.language_changed", { locale: next });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={t("nav.account")}
            className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-3"
            type="button"
          >
            <Avatar className="ph-no-capture">
              <AvatarImage alt="" src={image} />
              <AvatarFallback>
                {name.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {/* Base UI's MenuGroupLabel reads its context from Menu.Group and
            throws without one — a label is never loose in this menu. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="ph-no-capture truncate">
            {name || t("nav.account")}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-mono-label text-stone font-mono uppercase">
            {t("language.label")}
          </DropdownMenuLabel>
          {LOCALES.map((entry) => (
            <DropdownMenuItem key={entry} onClick={() => selectLocale(entry)}>
              <LanguagesIcon />
              {LOCALE_LABELS[entry]}
              {entry === locale && <CheckIcon className="ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => setTheme(nextTheme)}>
          {/* Named rather than interpolated, like <ModeToggle> — a sentence
              assembled from a translated frame and an English noun is how a
              localised label comes out half-English. */}
          {nextTheme === "dark" ? <MoonIcon /> : <SunIcon />}
          {nextTheme === "dark"
            ? t("theme.switchToDark")
            : t("theme.switchToLight")}
        </DropdownMenuItem>

        <DropdownMenuItem
          render={
            <a
              href={contentPageUrl(locale, "about")}
              rel="noreferrer"
              target="_blank"
            />
          }
        >
          <LifeBuoyIcon />
          {t("nav.help")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={signOut}>
          <LogOutIcon />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  const locale = currentLocale();

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
            {/* The phone has no footer to reach these from either. */}
            <a
              className="text-muted-foreground hover:bg-muted/40 focus-visible:ring-ring/50 text-body-lg flex h-12 items-center rounded-md px-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-inset"
              href={contentPageUrl(locale, "about")}
              rel="noreferrer"
              target="_blank"
            >
              {t("nav.help")}
            </a>
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
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:gap-8 sm:px-8">
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

        <div className="hidden md:block">
          <AccountMenu image={session?.user.image ?? undefined} name={name} />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Avatar className="ph-no-capture">
            <AvatarImage src={session?.user.image ?? undefined} alt="" />
            <AvatarFallback>
              {name.charAt(0).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
