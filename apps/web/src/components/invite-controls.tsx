import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckIcon,
  Loader2Icon,
  RefreshCwIcon,
  UserPlusIcon,
} from "lucide-react";
import {
  createRunInviteMutation,
  getRunPartnerQueryKey,
  listRunInvitesOptions,
  listRunInvitesQueryKey,
  revokeRunInviteMutation,
  type RunInvite,
} from "@/api";
import { trackError, trackEvent } from "@/lib/logger";
import { cn } from "@/lib/utils";
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
 * One shape, unlike `RenderControls`: the wide studio's options card and the
 * phone's options sheet show the same stack. It used to have a tile as well —
 * one cell of the phone's icon row, which minted a link and shared it — and
 * that cell could do only the first of the four things this does. Waiting on
 * somebody, asking whether they have answered and taking them back out have no
 * icon-sized form, and an action row is not where a state lives.
 *
 * `supported` is the cut on screen having a second lane to put somebody in —
 * `needsPartner` on the catalogue entry, and today that is the duo replay
 * alone. A film with one runner in it has nothing to invite anybody *to*, so
 * the question isn't asked and the run's invitations aren't even fetched.
 */
export function InviteControls({
  activityId,
  runName,
  supported,
}: {
  activityId: number;
  runName: string;
  supported: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const path = { id: String(activityId) };

  const invitations = useQuery({
    ...listRunInvitesOptions({ path }),
    enabled: supported,
  });
  const invites = invitations.data?.invites ?? [];
  // The live one, if there is one. Everything else on this run is history and
  // the studio does not draw it — an athlete looking at a film does not need a
  // ledger of who they have asked.
  const open = invites.find((invite) => invite.status === "pending") ?? null;
  const accepted = invites.find((invite) => invite.status === "accepted");
  const partnerName = accepted?.invitee_name ?? runName;

  /**
   * The run's invitations, and the second runner they resolve to.
   *
   * Both, because they are one fact read twice: this card asks the invitation
   * list who has answered, and the film beside it asks `GET /runs/{id}/partner`
   * for the run to draw. Refreshing only the first leaves an athlete who has
   * just removed somebody looking at a card that says nobody is in the video
   * and a player still drawing their route.
   */
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listRunInvitesQueryKey({ path }),
      }),
      queryClient.invalidateQueries({
        queryKey: getRunPartnerQueryKey({ path }),
      }),
    ]);
  };

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

  // One route does both halves of taking it back — cancelling a link nobody has
  // answered, and removing the runner who did. The row that comes back says
  // which it was: only somebody who accepted left a run id behind.
  const revoke = useMutation({
    ...revokeRunInviteMutation(),
    onSuccess: async (invite) => {
      const removed = invite.invitee_activity_id !== null;
      trackEvent(removed ? "ui.invite_partner_removed" : "ui.invite_revoked", {
        activityId,
      });
      await refresh();
      // The cancelled link needs no announcement: the button it was under is
      // gone. Losing a partner is a bigger thing, and the athlete is owed both
      // the confirmation and the way back.
      if (removed) {
        toast.success(t("invite.removed", { name: partnerName }), {
          description: t("invite.removedBody"),
        });
      }
    },
    onError: (err) => {
      trackError("ui.invite_revoke_failed", err, { activityId });
      toast.error(
        accepted
          ? t("invite.removeFailed", { name: partnerName })
          : t("invite.revokeFailed"),
      );
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

  /**
   * Ask again whether the link has been answered.
   *
   * An invitation is accepted on somebody else's phone, and nothing tells this
   * tab when that happens — until now the only way to find out was to reload
   * the studio, which is a lot of ceremony for a yes/no. The refetch is the
   * query's own rather than an invalidation because the answer is wanted here:
   * a link that is still pending has nothing to redraw, and a button that looks
   * like it did nothing reads as broken.
   */
  const check = async () => {
    trackEvent("ui.invite_checked", { activityId });
    const { data } = await invitations.refetch();
    // An answer redraws this panel by itself — the acceptance as its alert, a
    // decline or an expiry by dropping back to the invite button. Only "still
    // waiting" has nothing to show for itself, so only it is said out loud.
    const waiting = data?.invites.some((invite) => invite.status === "pending");
    if (waiting) return void toast(t("invite.checkPending"));
    // Somebody answered while this tab was open, so the film has a second
    // runner to go and fetch.
    await refresh();
  };

  // One tap does the whole thing: an athlete with no live link gets one made
  // and shared, and one who already has a link shares it again. The difference
  // is not a decision they should have to make.
  const onPrimary = () => {
    if (open) return void share(open);
    create.mutate({ path });
  };

  // A card and a sheet are both stacks of sections, and both simply drop the
  // ones this template has no use for — which is what the picker beside them
  // has already said, and why neither needs a greyed placeholder.
  if (!supported) return null;

  return (
    <div className="flex flex-col gap-3">
      {accepted ? (
        <>
          <Alert>
            <CheckIcon />
            <AlertTitle>
              {t("invite.acceptedTitle", { name: partnerName })}
            </AlertTitle>
            <AlertDescription>{t("invite.acceptedBody")}</AlertDescription>
          </Alert>

          {/* Where "Cancel the invitation" sits in the waiting state, and doing
              the same job. A run shows one partner, so this is the way back to
              a film with somebody else in it: remove, then invite again. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => revoke.mutate({ path: { token: accepted.token } })}
          >
            {busy ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              t("invite.remove", { name: partnerName })
            )}
          </Button>
        </>
      ) : (
        <>
          {/* Copy and check sit side by side because they are the two halves of
              waiting: send the link again, or find out whether it landed.

              While waiting, the pill gives up its icon and its wide padding to
              the one beside it. The card is 208px until xl, and this row's two
              labels are the longest in the catalogue — "Copier le lien à
              nouveau" did not fit the card even on its own. */}
          <div className="flex gap-2">
            <Button
              className={cn("min-w-0 flex-1", open && "px-4")}
              variant={open ? "subtle" : "outline"}
              disabled={busy}
              onClick={onPrimary}
            >
              {busy && <Loader2Icon className="animate-spin" />}
              {!busy && !open && <UserPlusIcon data-icon="inline-start" />}
              {open ? t("invite.copyAgain") : t("invite.action")}
            </Button>

            {open && (
              <Button
                size="icon"
                variant="subtle"
                aria-label={t("invite.check")}
                disabled={busy || invitations.isRefetching}
                onClick={check}
              >
                <RefreshCwIcon
                  className={invitations.isRefetching ? "animate-spin" : ""}
                />
              </Button>
            )}
          </div>

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
