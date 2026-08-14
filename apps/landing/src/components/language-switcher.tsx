import Link from "next/link";
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from "@/i18n/config";
import { fill, type Copy } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * Two links, not a dropdown — and a Server Component, which is the whole point.
 *
 * Both localised pages are prerendered, so switching language is a navigation
 * between two static documents. That needs no JavaScript at all, and keeps the
 * header out of the client bundle: `replay-phone.tsx` stays the only
 * `"use client"` file on this page.
 *
 * `proxy.ts` writes the cookie on the way through, so the choice made here is
 * what a later visit to `/` gets.
 */
export function LanguageSwitcher({
  copy,
  active,
  className,
  paths,
}: {
  copy: Copy;
  active: Locale;
  className?: string;
  paths?: Record<Locale, string>;
}) {
  return (
    <nav
      aria-label={copy.language.label}
      className={cn("flex items-center gap-1", className)}
    >
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={paths?.[locale] ?? `/${locale}`}
          hrefLang={locale}
          // No prefetch, because `proxy.ts` cannot tell one apart from a real
          // visit: a background fetch of `/fr` comes back with a `Set-Cookie`
          // the browser stores, and somebody reading in English would find
          // French waiting for them next time. Both documents are static and
          // tiny, so the navigation costs nothing worth this.
          prefetch={false}
          // The current language is still a link — it is the canonical URL for
          // this page, and marking it `aria-current` says so without taking it
          // out of the tab order.
          aria-current={locale === active ? "true" : undefined}
          aria-label={fill(copy.language.switchTo, {
            language: LOCALE_LABELS[locale],
          })}
          className={cn(
            "text-body-sm inline-flex h-9 items-center rounded-full px-2.5 font-semibold transition-colors",
            locale === active
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LOCALE_SHORT[locale]}
        </Link>
      ))}
    </nav>
  );
}
