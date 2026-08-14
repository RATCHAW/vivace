import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      // Named rather than interpolated: "light" and "dark" are words, and a
      // sentence assembled from a translated frame and an English noun is the
      // classic way a localised label comes out half-English.
      aria-label={next === "dark" ? t("theme.switchToDark") : t("theme.switchToLight")}
      onClick={() => setTheme(next)}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
