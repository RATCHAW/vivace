import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, UserPlusIcon } from "lucide-react";
import {
  createRunInviteMutation,
  listRunInvitesOptions,
  listRunInvitesQueryKey,
  revokeRunInviteMutation,
  type RunInvite,
} from "@/api";
import { trackError, trackEvent } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Where an invitation link points. Built here rather than by the API, which
 *  has no business knowing what the browser's routes are called. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

/**
 * Inviting whoever you ran with, from the run you ran with them.
 *
 * The whole mechanism is one link. There is no friend list behind this and no
 * request inbox — an invitation names one run and stops existing once it is
 * answered, which is both the smallest thing that works and the clearest
 * consent the invitee can give.
 *
 * The link is handed to the device's own share sheet rather than sent by us:
 * the athlete already has a way to reach the person they ran with, and Strava's
 * API terms forbid using its materials to contact a Strava user on our own
 * account.
 *
 * `layout` mirrors `RenderControls`. The panel is the wide studio's options
 * card; the tile is one cell of the phone's five-icon row, where there is no
 * room for a word.
 */
export function InviteControls({
  activityId,
  runName,
  layout,
}: {
  activityId: number;
  runName: string;
  layout: "panel" | "tile";
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const path = { id: String(activityId) };

  const { data } = useQuery(listRunInvitesOptions({ path }));
  const invites = data?.invites ?? [];
  // The live one, if there is one. Everything else on this run is history and
  // the studio does not draw it — an athlete looking at a film does not need a
  // ledger of who they have asked.
  const open = invites.find((invite) => invite.status === "pending") ?? null;
  const accepted = invites.find((invite) => invite.status === "accepted");

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: listRunInvitesQueryKey({ path }),
    });

  const create = useMutation({
    ...createRunInviteMutation(),
    onSuccess: async (invite) => {
      trackEvent("ui.invite_created", { activityId });
      await refresh();
      await share(invite);
    },
    onError: (err) => {
      trackError("ui.invite_create_failed", err, { activityId });
      toast.error(t("invite.createFailed"));
    },
  });

  const revoke = useMutation({
    ...revokeRunInviteMutation(),
    onSuccess: async () => {
      trackEvent("ui.invite_revoked", { activityId });
      await refresh();
    },
    onError: (err) => {
      trackError("ui.invite_revoke_failed", err, { activityId });
      toast.error(t("invite.revokeFailed"));
    },
  });

  /**
   * Share sheet where there is one, clipboard where there isn't — and clipboard
   * anyway when the sheet refuses.
   *
   * The fallback is not defensive padding, it is the common path on a phone.
   * The first tap has to mint the link before it can share it, and `await`ing
   * that request spends the transient user activation `navigator.share` needs,
   * so Safari rejects the call with `NotAllowedError`. Copying instead leaves
   * the athlete holding the link rather than holding nothing.
   */
  async function share(invite: RunInvite) {
    const url = inviteUrl(invite.token);

    if (navigator.share) {
      try {
        await navigator.share({ title: t("invite.shareTitle"), url });
        return;
      } catch (error) {
        // A dismissed sheet rejects too, and that one is an answer: the athlete
        // said no, so putting the link on their clipboard behind their back is
        // not the helpful reading.
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("invite.linkCopied"), {
        description: t("invite.linkCopiedBody"),
      });
    } catch {
      toast.error(t("invite.createFailed"));
    }
  }

  const busy = create.isPending || revoke.isPending;

  // One tap does the whole thing: an athlete with no live link gets one made
  // and shared, and one who already has a link shares it again. The difference
  // is not a decision they should have to make.
  const onPrimary = () => {
    if (open) return void share(open);
    create.mutate({ path });
  };

  if (layout === "tile") {
    return (
      <Button
        size="icon-fill"
        variant="subtle"
        aria-label={t("invite.action")}
        disabled={busy}
        onClick={onPrimary}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {accepted ? (
        <Alert>
          <CheckIcon />
          <AlertTitle>
            {t("invite.acceptedTitle", {
              name: accepted.invitee_name ?? runName,
            })}
          </AlertTitle>
          <AlertDescription>{t("invite.acceptedBody")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <Button
            variant={open ? "subtle" : "outline"}
            disabled={busy}
            onClick={onPrimary}
          >
            {busy ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <UserPlusIcon data-icon="inline-start" />
            )}
            {open ? t("invite.copyAgain") : t("invite.action")}
          </Button>

          {open && (
            <>
              <p className="text-caption text-stone">
                {t("invite.pendingBody", { days: daysLeft(open.expires_at) })}
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => revoke.mutate({ path: { token: open.token } })}
              >
                {t("invite.revoke")}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Whole days left on a link, rounded up so the last day reads "1" rather than
 * "0".
 *
 * Read off the invitation's own `expires_at` rather than from a constant
 * mirroring the API's TTL: the server is the only thing that decides when a
 * link dies, and a second copy of that number here would be wrong the first
 * time it changed there.
 */
function daysLeft(expiresAt: string): number {
  const ms = Date.parse(expiresAt) - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
