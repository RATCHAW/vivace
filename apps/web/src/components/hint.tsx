import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A control saying what is behind it, once, for as long as it takes to read.
 *
 * The shape a phone needs when the thing worth knowing is behind an icon. An
 * athlete who cannot see a panel cannot see what is missing from it either, so
 * the control that opens it says so itself — on arrival, on its own, and then
 * not again.
 *
 * It opens itself, because a phone has no hover to open it with: `open` comes
 * from the timers below and never from the trigger, so a tap lands on the
 * control and does the control's job instead of fighting a hover the browser
 * synthesised out of that same tap. `onOpenChange` is honoured in one direction
 * only, which is what lets Base UI close it — on a scroll, on a press outside —
 * without ever putting it back.
 *
 * At most once per mount. `show` can go false and true again while the screen
 * is up, and a hint that arrives every time is one to dismiss rather than one
 * to read.
 */
export function Hint({
  show,
  content,
  delay = 450,
  life = 5000,
  side = "top",
  align = "center",
  sideOffset = 8,
  onShown,
  children,
}: {
  /**
   * The moment worth pointing at — and, for as long as it lasts, the reason to
   * keep pointing. The hint goes the moment this does, so whatever the callout
   * was about to say can be switched off by the thing that says it better: the
   * panel opening, the lane filling, the answer landing.
   */
  show: boolean;
  content: ReactNode;
  /**
   * How long after `show` the hint arrives. Deliberately not zero — a callout
   * in the same frame as whatever just changed is one more thing moving, and
   * reads as part of the churn. Waiting for the screen to be still is what
   * makes it read as an answer to what the athlete just did.
   */
  delay?: number;
  /**
   * And how long it stays. Long enough to read a short sentence twice, short
   * enough that it is gone before it is in the way of what it points across.
   */
  life?: number;
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  align?: React.ComponentProps<typeof TooltipContent>["align"];
  sideOffset?: number;
  /**
   * Fired once, and only for a callout that was actually on screen — the window
   * can open behind a sheet or on another screen, and that is not a hint
   * anybody read.
   */
  onShown?: () => void;
  /**
   * The control itself. Cloned as the tooltip's trigger, so the row or header
   * it sits in keeps the shape it had.
   */
  children: ReactElement;
}) {
  // Time alone: false, true at `delay`, false again a `life` later. What the
  // athlete is looking at is that window *and* the screen still wanting it, so
  // the second half is masked in rather than written — a hint that has to be
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
      window.setTimeout(() => setDue(true), delay),
      window.setTimeout(() => setDue(false), delay + life),
    ];
  }, [show, delay, life]);

  // Cleared on the way out rather than whenever `show` turns over: this is a
  // few seconds' window, not a subscription. An athlete who leaves the state
  // inside it and comes straight back finds whatever is left of it; one who
  // leaves the screen takes nothing with them.
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

  useEffect(() => {
    if (!open || logged.current) return;
    logged.current = true;
    onShown?.();
  }, [open, onShown]);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (!next) setDue(false);
      }}
    >
      <TooltipTrigger render={children} />
      <TooltipContent align={align} side={side} sideOffset={sideOffset}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
