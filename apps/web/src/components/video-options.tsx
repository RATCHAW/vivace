import { useTranslation } from "react-i18next";
import {
  getTemplate,
  KEY_COLOR,
  THEMES,
  THEME_NAMES,
  type TemplateId,
  type ThemeName,
} from "@repo/video";
import { useVideoLabels } from "@/i18n/video";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * How the replay is cut, chosen before it is rendered. Everything here changes
 * the film itself, not the page around it — the player beside it updates as each
 * choice is made, and the same choices are what the Lambda render is started
 * with. *Which* film is a different question, and it is asked above the player
 * by `<TemplateSelect>`; these are the options within one.
 *
 * The panel around this — its heading, its border, and on a phone the sheet it
 * collapses into — belongs to `<RunStudio>`, because the render button lives in
 * the same box and the two must not each draw their own.
 *
 * `avatarUrl` is the athlete's Strava picture, or "" when they never set one —
 * the marker has nothing to be in that case, so the switch says so rather than
 * silently doing nothing. An empty one means three different things while the
 * profile is loading, once it has failed, and once it is here, and a switch
 * that can't be thrown owes the athlete the right one.
 */
export function VideoOptions({
  template,
  theme,
  onThemeChange,
  avatarSupported,
  avatarUrl,
  name,
  pending,
  failed,
  showAvatar,
  onShowAvatarChange,
  greenscreen,
  onGreenscreenChange,
}: {
  /** Which cut is playing — it decides which of these options it honours. */
  template: TemplateId;
  theme: ThemeName;
  onThemeChange: (next: ThemeName) => void;
  /** False when the chosen template draws no runner to put a face on. */
  avatarSupported: boolean;
  avatarUrl: string;
  name: string;
  pending: boolean;
  failed: boolean;
  showAvatar: boolean;
  onShowAvatarChange: (next: boolean) => void;
  greenscreen: boolean;
  onGreenscreenChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const entry = getTemplate(template);
  const themeSupported = entry.supportsTheme;

  return (
    <div className="flex flex-col gap-4">
      {themeSupported && (
        <ThemePicker
          theme={theme}
          onChange={onThemeChange}
          greenscreen={greenscreen}
        />
      )}

      {avatarSupported && (
        // DESIGN.md: a hairline and a surface, no elevation shadow.
        <div className="bg-muted/40 flex items-center gap-3 rounded-md border px-4 py-3.5">
          <Avatar className="ph-no-capture size-8 shrink-0">
            <AvatarImage src={avatarUrl || undefined} alt="" />
            <AvatarFallback>
              {name.charAt(0).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>

          <Label
            htmlFor="show-avatar"
            className="flex min-w-0 flex-col items-start gap-1"
          >
            <span className="text-body-sm font-semibold">
              {t("videoOptions.runAsAvatar")}
            </span>
            <span className="text-caption text-muted-foreground font-normal">
              {avatarUrl
                ? t("videoOptions.avatarReady")
                : pending
                  ? t("videoOptions.avatarPending")
                  : failed
                    ? t("videoOptions.avatarFailed")
                    : t("videoOptions.avatarMissing")}
            </span>
          </Label>

          <Switch
            id="show-avatar"
            className="ml-auto shrink-0"
            disabled={!avatarUrl}
            checked={showAvatar}
            onCheckedChange={onShowAvatarChange}
          />
        </div>
      )}

      {/* Last, and on every template: this one doesn't change what the film
          says, it changes what can be done with the file afterwards. */}
      <div className="bg-muted/40 flex items-center gap-3 rounded-md border px-4 py-3.5">
        {/* The one swatch in the app painted in a colour nobody chose for its
            looks — it is the colour the athlete will be keying away, so it is
            the colour it has to be. */}
        <span
          aria-hidden
          className="size-8 shrink-0 rounded-full border"
          style={{ backgroundColor: KEY_COLOR, borderColor: KEY_COLOR }}
        />

        <Label
          htmlFor="greenscreen"
          className="flex min-w-0 flex-col items-start gap-1"
        >
          <span className="text-body-sm font-semibold">
            {t("videoOptions.greenscreen")}
          </span>
          <span className="text-caption text-muted-foreground font-normal">
            {/* A template built on a basemap is giving something up for this,
                and the athlete should read that before they throw the switch —
                not discover it in the player. */}
            {entry.usesMap
              ? t("videoOptions.greenscreenMap")
              : t("videoOptions.greenscreenHint")}
          </span>
        </Label>

        <Switch
          id="greenscreen"
          className="ml-auto shrink-0"
          checked={greenscreen}
          onCheckedChange={onGreenscreenChange}
        />
      </div>
    </div>
  );
}

/**
 * The look. Three, shared by every template that has one — no generated
 * palettes, and no per-template variants: a Vivace video is recognisable
 * because the catalogue is small.
 */
function ThemePicker({
  theme,
  onChange,
  greenscreen,
}: {
  theme: ThemeName;
  onChange: (next: ThemeName) => void;
  /** The look still applies on the key plate — it is the ink and the
   *  illustration, not the background — but every swatch's canvas is the key
   *  colour then, and a swatch that showed black would be describing a film
   *  that isn't being made. */
  greenscreen: boolean;
}) {
  const { t } = useTranslation();
  const labels = useVideoLabels();

  return (
    <div
      role="group"
      aria-label={t("videoOptions.themeGroup")}
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap gap-2">
        {THEME_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === theme}
            onClick={() => onChange(name)}
            className={cn(
              "text-body-sm focus-visible:ring-ring/50 inline-flex h-12 items-center gap-2.5 rounded-full border px-4 font-semibold transition-colors duration-100 ease-out outline-none active:translate-y-px focus-visible:ring-3",
              name === theme
                ? "bg-muted border-transparent"
                : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            {/* The swatch is the theme's own canvas and accent — the only place
                in the app that paints with the video's tokens rather than the
                page's, because it is describing the file, not the page. */}
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-full border"
              style={{
                backgroundColor: greenscreen ? KEY_COLOR : THEMES[name].canvas,
                borderColor: THEMES[name].accent,
              }}
            />
            {labels.themeLabel(name)}
          </button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {labels.themeDescription(theme)}
      </p>
    </div>
  );
}
