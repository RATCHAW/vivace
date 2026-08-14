import { useTranslation } from "react-i18next";
import { CheckIcon, LanguagesIcon } from "lucide-react";
import { changeLocale, currentLocale } from "@/i18n";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/locales";
import { trackEvent } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Which language the app speaks, beside the theme toggle it is a sibling of —
 * both are preferences about the chrome rather than about the training.
 *
 * A menu rather than a two-state toggle: the pair is EN/FR today, but the
 * shape shouldn't have to change the first time a third is added.
 */
export function LanguageToggle() {
  const { t } = useTranslation();
  const active = currentLocale();

  const select = (locale: Locale) => {
    if (locale === active) return;
    changeLocale(locale);
    trackEvent("ui.language_changed", { locale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t("language.change")}>
            <LanguagesIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {LOCALES.map((locale) => (
          <DropdownMenuItem key={locale} onClick={() => select(locale)}>
            {LOCALE_LABELS[locale]}
            {locale === active && <CheckIcon className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
