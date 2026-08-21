import { type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Hint } from "@/components/hint";
import { trackEvent } from "@/lib/logger";

/**
 * How long after the cut settles the hint arrives.
 *
 * Choosing the duo replay closes a select, swaps the film and starts a fetch;
 * a callout in the same frame is a fourth thing moving.
 */
const HINT_DELAY = 450;

/**
 * And how long it stays.
 *
 * Nothing is lost when it goes: the dot on the tile is what carries the state
 * afterwards, and the sentence is still on the duo row of the picker above.
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
 * On a phone this whole studio unmounts on the way back to the list, so
 * `Hint`'s once-per-mount is also once per run.
 */
export function InviteHint({
  /** A cut with a second lane on screen, nobody in it, and the answer actually
   *  in — not a partner request still in flight. */
  show,
  activityId,
  /** The tile itself. */
  children,
}: {
  show: boolean;
  activityId: number;
  children: ReactElement;
}) {
  const { t } = useTranslation();

  return (
    <Hint
      content={t("invite.hint")}
      delay={HINT_DELAY}
      life={HINT_LIFE}
      onShown={() => trackEvent("ui.invite_hint_shown", { activityId })}
      show={show}
      // Above the tile, which is the only side with room: the row it belongs to
      // is the last thing on the screen, over a home indicator.
      side="top"
    >
      {children}
    </Hint>
  );
}
