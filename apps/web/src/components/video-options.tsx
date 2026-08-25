import { useTranslation } from "react-i18next";
import { ActivityIcon, HeartIcon } from "lucide-react";
import {
  getTemplate,
  KEY_COLOR,
  PULSE_MODES,
  THEMES,
  THEME_NAMES,
  type PulseMode,
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
  pulse,
  onPulseChange,
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
  pulse: PulseMode;
  onPulseChange: (next: PulseMode) => void;
}) {
  const { t } = useTranslation();
  const entry = getTemplate(template);
  const themeSupported = entry.supportsTheme;

  return (
    <div className="flex flex-col gap-4">
      {/* First, and above the look: on the one cut that has a heartbeat this is
          what the film *is*, where the theme is what it wears. */}
      {entry.supportsPulse && (
        <PulsePicker value={pulse} onChange={onPulseChange} />
      )}

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

/** One glyph per tempo. Two words alone read as the same kind of thing — a
 *  steady heart and a spike say the difference before the caption does. */
const PULSE_ICONS: Record<PulseMode, typeof HeartIcon> = {
  average: HeartIcon,
  peak: ActivityIcon,
};

/**
 * What the heartbeat keeps time to — the one option that changes what the film
 * *sounds* like rather than what it looks like.
 *
 * Same shape as the theme picker below it on purpose: they are both "pick one
 * of these", and giving the sound its own kind of control would make it read as
 * a setting rather than as part of the cut. The caption underneath carries the
 * whole explanation, because the pills have to stay one word each — and what it
 * has to get across is that both of these are *real time*, which is the only
 * reason the film is worth listening to.
 */
function PulsePicker({
  value,
  onChange,
}: {
  value: PulseMode;
  onChange: (next: PulseMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("videoOptions.pulseGroup")}
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap gap-2">
        {PULSE_MODES.map((mode) => {
          const Icon = PULSE_ICONS[mode];
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onChange(mode)}
              className={cn(
                "text-body-sm focus-visible:ring-ring/50 inline-flex h-12 items-center gap-2 rounded-full border px-4 font-semibold transition-colors duration-100 ease-out outline-none active:translate-y-px focus-visible:ring-3",
                mode === value
                  ? "bg-muted border-transparent"
                  : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  mode === value && "text-brand",
                )}
              />
              {t(`videoOptions.pulse.${mode}.label`)}
            </button>
          );
        })}
      </div>
      <p className="text-caption text-muted-foreground">
        {t(`videoOptions.pulse.${value}.description`)}
      </p>
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
