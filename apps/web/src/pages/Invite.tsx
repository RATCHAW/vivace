import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { formatClock } from "@repo/video";
import {
  acceptRunInviteMutation,
  ApiRequestError,
  declineRunInviteMutation,
  getRunInviteCandidatesOptions,
  getRunInviteOptions,
  type Run,
} from "@/api";
import { useFormatters } from "@/i18n/format";
import { authClient } from "@/lib/auth-client";
import { trackError, trackEvent } from "@/lib/logger";
import { NEXT_PARAM } from "@/lib/next-path";
import { StravaIcon } from "@/components/icons";
import { LanguageToggle } from "@/components/language-toggle";
import { MonoLabel } from "@/components/mono";
import { Wordmark } from "@/components/wordmark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Answering an invitation to appear in someone else's run video.
 *
 * The one surface in the app a signed-out stranger is meant to land on, and it
 * is built around that: it says who is asking and which run *before* it asks
 * for anything, because the next thing it wants is a Strava account. A page
 * that opened with an OAuth button and explained itself afterwards would be
 * asking for a grant on trust the reader has no reason to extend yet.
 *
 * Three steps, and no more — see the invite copy in `i18n/messages`. Read the
 * invitation, sign in with Strava, confirm which run was yours. The sign-in is
 * unavoidable (a second runner's pace is only readable with that runner's own
 * token), so the design folds it into accepting rather than putting it in front.
 */
export function Invite() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session);

  const {
    data: preview,
    isPending,
    error,
  } = useQuery({
    ...getRunInviteOptions({ path: { token } }),
    // Public, and the reader may have no session at all — a 404 here is a dead
    // link, not something a retry fixes.
    retry: false,
  });

  if (isPending || sessionPending) {
    return (
      <InviteFrame>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
          <span>{t("invite.accept.loading")}</span>
        </div>
      </InviteFrame>
    );
  }

  if (error || !preview) {
    return (
      <InviteFrame>
        <Alert variant="destructive">
          <AlertTitle>{t("invite.accept.invalidTitle")}</AlertTitle>
          <AlertDescription>{t("invite.accept.invalidBody")}</AlertDescription>
        </Alert>
      </InviteFrame>
    );
  }

  if (preview.status !== "pending") {
    return (
      <InviteFrame>
        <InviteHeadline preview={preview} />
        <Alert>
          <AlertTitle>{t("invite.accept.closedTitle")}</AlertTitle>
          <AlertDescription>{t("invite.accept.closedBody")}</AlertDescription>
        </Alert>
      </InviteFrame>
    );
  }

  return (
    <InviteFrame>
      <InviteHeadline preview={preview} />
      {signedIn ? (
        <PickRun token={token} inviterName={preview.inviter_name} />
      ) : (
        <SignInStep token={token} />
      )}
    </InviteFrame>
  );
}

/**
 * The page's chrome.
 *
 * Deliberately not `AppShell`: that carries the signed-in header — an avatar
 * menu, a nav to Replays and the Coach — and every one of those is a dead end
 * for somebody who has no account. The wordmark and the language picker are
 * what this reader actually needs, which is the same pair the sign-in screen
 * shows for the same reason.
 */
function InviteFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col gap-12 px-6 py-12 sm:px-10 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <Wordmark size="lg" />
        <LanguageToggle />
      </div>
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-8">
        {children}
      </div>
    </main>
  );
}

function InviteHeadline({
  preview,
}: {
  preview: {
    inviter_name: string;
    run_name: string;
    run_date: string;
    run_distance: number;
    run_moving_time: number;
  };
}) {
  const { t } = useTranslation();
  const format = useFormatters();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-display-lg text-balance">
        {t("invite.accept.title", { name: preview.inviter_name })}
      </h1>
      <MonoLabel>
        {t("invite.accept.runLine", {
          name: preview.run_name,
          // The run's own local day. `run_date` is a plain `YYYY-MM-DD` from the
          // API rather than a timestamp, so it is read as one — see format.ts on
          // why a date is never put through a timezone here.
          date: format.raceDay(preview.run_date),
          distance: (preview.run_distance / 1000).toFixed(2),
          duration: formatClock(preview.run_moving_time),
        })}
      </MonoLabel>
    </div>
  );
}

/** Step two: the Strava grant, explained before it is asked for. */
function SignInStep({ token }: { token: string }) {
  const { t } = useTranslation();

  // Straight to the sign-in screen carrying where to come back to, rather than
  // starting OAuth here: `Login` already owns the provider call, the error
  // states and the `next` sanitising, and a second copy of that would be a
  // second place for an open redirect to appear.
  const next = `/login?${NEXT_PARAM}=${encodeURIComponent(`/invite/${token}`)}`;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-body-lg text-muted-foreground text-balance">
        {t("invite.accept.whatHappens")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={() => trackEvent("ui.invite_sign_in_clicked", {})}
          render={<Link to={next} />}
        >
          <StravaIcon className="text-strava" />
          {t("invite.accept.connect")}
        </Button>
        <DeclineButton token={token} />
      </div>
      <span className="text-caption text-stone">
        {t("invite.accept.withdrawNote")}
      </span>
    </div>
  );
}

/** Step three: which of my runs was it, and do I agree. */
function PickRun({
  token,
  inviterName,
}: {
  token: string;
  inviterName: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [chosen, setChosen] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const {
    data,
    isPending,
    error: candidatesError,
  } = useQuery({
    ...getRunInviteCandidatesOptions({ path: { token } }),
    retry: false,
  });

  const accept = useMutation({
    ...acceptRunInviteMutation(),
    onSuccess: () => {
      trackEvent("ui.invite_accepted", { token: null });
      setDone(true);
    },
    onError: (err) => trackError("ui.invite_accept_failed", err),
  });

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <Alert>
          <CheckIcon />
          <AlertTitle>{t("invite.accept.doneTitle")}</AlertTitle>
          <AlertDescription>
            {t("invite.accept.doneBody", { name: inviterName })}
          </AlertDescription>
        </Alert>
        <Button size="lg" onClick={() => void navigate("/replays")}>
          {t("invite.accept.goToApp")}
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="text-muted-foreground flex items-center gap-3">
        <Loader2Icon className="size-5 animate-spin" />
        <span>{t("invite.accept.loading")}</span>
      </div>
    );
  }

  if (candidatesError) {
    // 409 is the invitation being closed under us, or being our own — both are
    // states rather than faults, and both read better as a sentence than as a
    // red box saying the request failed. The generated options type the error
    // as the bare `ApiError` body; the status only exists on the wrapper the
    // client's interceptor throws, so it is narrowed the way query-client does.
    const own =
      candidatesError instanceof ApiRequestError &&
      candidatesError.status === 409;
    return (
      <Alert variant={own ? "default" : "destructive"}>
        <AlertTitle>
          {own ? t("invite.accept.ownTitle") : t("invite.accept.pickFailed")}
        </AlertTitle>
        <AlertDescription>
          {own ? t("invite.accept.ownBody") : candidatesError.error}
        </AlertDescription>
      </Alert>
    );
  }

  const candidates = data.candidates;

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Alert>
          <AlertTitle>{t("invite.accept.pickEmptyTitle")}</AlertTitle>
          <AlertDescription>
            {t("invite.accept.pickEmptyBody")}
          </AlertDescription>
        </Alert>
        <DeclineButton token={token} />
      </div>
    );
  }

  // The exact sentence the athlete is agreeing to, resolved in their language
  // and sent with the acceptance so the row records what was actually shown.
  const consent = t("invite.accept.consent", { name: inviterName });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-heading-md font-heading">
          {t("invite.accept.pickTitle")}
        </h2>
        <p className="text-body-md text-muted-foreground">
          {t("invite.accept.pickBody")}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {candidates.map((run) => (
          <li key={run.id}>
            <CandidateRow
              run={run}
              selected={chosen === run.id}
              onSelect={() => setChosen(run.id)}
            />
          </li>
        ))}
      </ul>

      <p className="text-body-sm text-muted-foreground text-balance">
        {consent}
      </p>

      {accept.error && (
        <Alert variant="destructive">
          <AlertTitle>{t("invite.accept.confirmFailed")}</AlertTitle>
          <AlertDescription>{accept.error.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          disabled={chosen == null || accept.isPending}
          onClick={() => {
            if (chosen == null) return;
            accept.mutate({
              path: { token },
              body: { activity_id: chosen, consent_text: consent },
            });
          }}
        >
          {accept.isPending && <Loader2Icon className="animate-spin" />}
          {accept.isPending
            ? t("invite.accept.confirming")
            : t("invite.accept.confirm")}
        </Button>
        <DeclineButton token={token} />
      </div>

      <span className="text-caption text-stone">
        {t("invite.accept.withdrawNote")}
      </span>
    </div>
  );
}

/** One of the invitee's runs, as a radio in everything but markup. */
function CandidateRow({
  run,
  selected,
  onSelect,
}: {
  run: Run;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormatters();

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 rounded-md border p-4 text-left transition-colors",
        selected ? "border-foreground bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <span className="text-body-md font-semibold">{run.name}</span>
      <MonoLabel>
        {format.shortDate(run.start_date_local)} ·{" "}
        {(run.distance / 1000).toFixed(2)} {t("common.km")} ·{" "}
        {formatClock(run.moving_time)}
      </MonoLabel>
    </button>
  );
}

function DeclineButton({ token }: { token: string }) {
  const { t } = useTranslation();
  const [declined, setDeclined] = useState(false);

  const decline = useMutation({
    ...declineRunInviteMutation(),
    onSuccess: () => {
      trackEvent("ui.invite_declined", {});
      setDeclined(true);
    },
    onError: (err) => trackError("ui.invite_decline_failed", err),
  });

  if (declined) {
    return (
      <span className="text-body-sm text-muted-foreground">
        {t("invite.accept.closedTitle")}
      </span>
    );
  }

  return (
    <Button
      variant="subtle"
      size="lg"
      disabled={decline.isPending}
      onClick={() => decline.mutate({ path: { token } })}
    >
      {t("invite.accept.decline")}
    </Button>
  );
}
