import { getTemplate, VIDEO_TEMPLATES, type TemplateId } from "@repo/video";
import { MonoLabel } from "@/components/mono";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * How the replay is cut, chosen before it is rendered. Everything here changes
 * the film itself, not the page around it — the player above updates as each
 * choice is made, and the same choices are what the Lambda render is started
 * with.
 *
 * `avatarUrl` is the athlete's Strava picture, or "" when they never set one —
 * the marker has nothing to be in that case, so the switch says so rather than
 * silently doing nothing. An empty one means three different things while the
 * profile is loading, once it has failed, and once it is here, and a switch
 * that can't be thrown owes the athlete the right one.
 */
export function VideoOptions({
  template,
  onTemplateChange,
  avatarSupported,
  avatarUrl,
  name,
  pending,
  failed,
  showAvatar,
  onShowAvatarChange,
}: {
  template: TemplateId;
  onTemplateChange: (next: TemplateId) => void;
  /** False when the chosen template draws no runner to put a face on. */
  avatarSupported: boolean;
  avatarUrl: string;
  name: string;
  pending: boolean;
  failed: boolean;
  showAvatar: boolean;
  onShowAvatarChange: (next: boolean) => void;
}) {
  return (
    <section aria-label="Video options" className="mt-5 flex flex-col gap-3">
      <MonoLabel>Video options</MonoLabel>

      <TemplatePicker template={template} onChange={onTemplateChange} />

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
 * Which cut to play and render. Renders nothing while the catalogue holds a
 * single template — there is no choice to offer — so adding one to
 * `@repo/video`'s registry is what puts this on screen.
 *
 * Toggle buttons rather than a radio group: the design system's pill is already
 * the vocabulary for "one of these", and shadcn's radio-group is the upgrade if
 * the catalogue ever outgrows a single row.
 */
function TemplatePicker({
  template,
  onChange,
}: {
  template: TemplateId;
  onChange: (next: TemplateId) => void;
}) {
  if (VIDEO_TEMPLATES.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Video template"
      className="flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap gap-2">
        {VIDEO_TEMPLATES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === template}
            onClick={() => onChange(entry.id)}
            className={cn(
              "text-body-sm focus-visible:ring-ring/50 inline-flex h-12 items-center rounded-full border px-5 font-semibold outline-none focus-visible:ring-3",
              entry.id === template
                ? "bg-muted border-transparent"
                : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {getTemplate(template).description}
      </p>
    </div>
  );
}
