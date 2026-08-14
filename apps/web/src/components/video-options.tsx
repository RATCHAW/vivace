import { getTemplate, THEMES, THEME_NAMES, type TemplateId, type ThemeName } from "@repo/video";
import { MonoLabel } from "@/components/mono";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * How the replay is cut, chosen before it is rendered. Everything here changes
 * the film itself, not the page around it — the player above updates as each
 * choice is made, and the same choices are what the Lambda render is started
 * with. *Which* film is a different question, and it is asked above the player
 * by `<TemplateSelect>`; these are the options within one.
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
}) {
  const themeSupported = getTemplate(template).supportsTheme;
  // A template that honours neither option has no panel — the picker above the
  // player is the whole of its configuration.
  if (!themeSupported && !avatarSupported) return null;

  return (
    <section aria-label="Video options" className="mt-5 flex flex-col gap-3">
      <MonoLabel>Video options</MonoLabel>

      {themeSupported && <ThemePicker theme={theme} onChange={onThemeChange} />}

      {avatarSupported && (
        // DESIGN.md: a hairline and a surface, no elevation shadow.
        <div className="bg-muted/40 flex items-center gap-4 rounded-md border px-5 py-4">
          <Avatar className="ph-no-capture size-9">
            <AvatarImage src={avatarUrl || undefined} alt="" />
            <AvatarFallback>{name.charAt(0).toUpperCase() || "?"}</AvatarFallback>
          </Avatar>

          <Label htmlFor="show-avatar" className="flex min-w-0 flex-col items-start gap-1">
            <span className="text-body-sm font-semibold">Run as your avatar</span>
            <span className="text-caption text-muted-foreground font-normal">
              {avatarUrl
                ? "Your Strava photo leads the route instead of the dot."
                : pending
                  ? "Checking your Strava profile…"
                  : failed
                    ? "Your Strava profile could not be read."
                    : "Add a photo on Strava to use this."}
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
    </section>
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
}: {
  theme: ThemeName;
  onChange: (next: ThemeName) => void;
}) {
  return (
    <div role="group" aria-label="Video theme" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {THEME_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === theme}
            onClick={() => onChange(name)}
            className={cn(
              "text-body-sm focus-visible:ring-ring/50 inline-flex h-12 items-center gap-2.5 rounded-full border px-4 font-semibold outline-none focus-visible:ring-3",
              name === theme ? "bg-muted border-transparent" : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            {/* The swatch is the theme's own canvas and accent — the only place
                in the app that paints with the video's tokens rather than the
                page's, because it is describing the file, not the page. */}
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-full border"
              style={{
                backgroundColor: THEMES[name].canvas,
                borderColor: THEMES[name].accent,
              }}
            />
            {THEMES[name].label}
          </button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">{THEMES[theme].description}</p>
    </div>
  );
}
