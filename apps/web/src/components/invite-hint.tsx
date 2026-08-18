import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trackEvent } from "@/lib/logger";

/**
 * How long after the cut settles the hint arrives.
 *
 * Deliberately not zero. Choosing the duo replay closes a select, swaps the
 * film and starts a fetch; a callout in the same frame is a fourth thing moving
 * and reads as part of the churn. Waiting for the screen to be still is what
 * makes it read as an answer to what the athlete just did.
 */
const HINT_DELAY = 450;

/**
 * And how long it stays.
 *
 * Long enough to read a short sentence twice, short enough that it is gone
 * before it is in the way of the film it is pointing across. Nothing is lost
 * when it goes: the dot on the tile is what carries the state afterwards, and
 * the sentence is still on the duo row of the picker above.
 */
const HINT_LIFE = 5000;

/**
 * The phone's pointer at the invitation.
 *
 * On a wide screen the invitation is a card in the options panel, in view for
 * as long as the duo cut is on screen. On a phone it is behind the Options
 * tile — a sliders icon in a row of four, which says nothing about who is
 * missing from the film. An athlete who picks the duo replay there is shown a
 * second lane with nobody in it and no indication that the way to fill it is
 * one tap away, so the tile says so itself, once, when they pick the cut.
 *
 * It opens itself, because a phone has no hover to open it with: `open` comes
 * from the timers below and never from the trigger, so a tap lands on the tile
 * and opens the sheet instead of fighting a hover the browser synthesised out
 * of that same tap. `onOpenChange` is honoured in one direction only, which is
 * what lets Base UI close it — on a scroll, on a press outside — without ever
 * putting it back.
 *
 * At most once per visit. `show` goes false and true again every time the
 * athlete leaves the duo cut and comes back to it, and a hint that arrives
 * every time is a hint they have to dismiss rather than one they read. On a
 * phone this whole studio unmounts on the way back to the list, so "once per
 * visit" is also once per run.
 */
export function InviteHint({
  /** A cut with a second lane on screen, nobody in it, and the answer actually
   *  in — not a partner request still in flight. */
  show,
  activityId,
  /** The tile itself. Cloned as the tooltip's trigger, so the row it sits in
   *  keeps its four cells. */
  children,
}: {
  show: boolean;
  activityId: number;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  // Time alone: false, true at HINT_DELAY, false again a HINT_LIFE later. What
  // the athlete is looking at is that window *and* the studio still wanting it,
  // so the second half is masked in rather than written — a hint that has to be
  // switched off by the thing it points at is a hint that can be left on.
  const [due, setDue] = useState(false);
  const open = due && show;
  // Neither of these is state: nothing is drawn from them.
  const timers = useRef<number[]>([]);
  const spent = useRef(false);
  const logged = useRef(false);

  useEffect(() => {
    if (!show || spent.current) return;
    spent.current = true;
    timers.current = [
      window.setTimeout(() => setDue(true), HINT_DELAY),
      window.setTimeout(() => setDue(false), HINT_DELAY + HINT_LIFE),
    ];
  }, [show]);

  // Cleared on the way out rather than whenever `show` turns over: this is a
  // five-second window, not a subscription. An athlete who leaves the duo cut
  // inside it and comes straight back finds whatever is left of it; one who
  // leaves the studio takes nothing with them.
  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      // StrictMode's rehearsal mount lands here too, having already claimed the
      // hint above and had its timers torn down — so the claim is given back,
      // or the pass that counts would find nothing left to show.
      spent.current = false;
    },
    [],
  );

  // Once, and only for a callout that was actually on screen — the window can
  // open behind a sheet or on another cut, and that is not a hint anybody read.
  useEffect(() => {
    if (!open || logged.current) return;
    logged.current = true;
    trackEvent("ui.invite_hint_shown", { activityId });
  }, [open, activityId]);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (!next) setDue(false);
      }}
    >
      <TooltipTrigger render={children} />
      {/* Above the tile, which is the only side with room: the row it belongs
          to is the last thing on the screen, over a home indicator. */}
      <TooltipContent side="top" sideOffset={8}>
        {t("invite.hint")}
      </TooltipContent>
    </Tooltip>
  );
}
