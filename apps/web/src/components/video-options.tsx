import { MonoLabel } from "@/components/mono";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * How the replay is cut, chosen before it is rendered. Everything here changes
 * the film itself, not the page around it — the player above updates as each
 * switch is thrown, and the same choices are what the Lambda render is started
 * with.
 *
 * `avatarUrl` is the athlete's Strava picture, or "" when they never set one —
 * the marker has nothing to be in that case, so the switch says so rather than
 * silently doing nothing. An empty one means three different things while the
 * profile is loading, once it has failed, and once it is here, and a switch
 * that can't be thrown owes the athlete the right one.
 */
export function VideoOptions({
  avatarUrl,
  name,
  pending,
  failed,
  showAvatar,
  onShowAvatarChange,
}: {
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

      {/* DESIGN.md: a hairline and a surface, no elevation shadow. */}
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
    </section>
  );
}
