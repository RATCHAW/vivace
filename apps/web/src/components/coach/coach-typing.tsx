// "The coach is working on it."
//
// A stream can be silent for several seconds while a tool reads Strava, and the
// gap between pressing send and the first token is exactly where a chat feels
// broken. This says which of the two is happening, and never sits on screen
// without something behind it.
import { cn } from "@/lib/utils";
import { MonoLabel } from "@/components/mono";

/** Staggered so the row reads left to right, like something being thought. */
const DELAYS = ["0ms", "200ms", "400ms"] as const;

export interface CoachTypingProps {
  /** What is actually happening: "Reading your recent runs", "Writing", … */
  label: string;
  className?: string;
}

export function CoachTyping({ label, className }: CoachTypingProps) {
  return (
    <div
      aria-live="polite"
      className={cn("flex items-center gap-2.5", className)}
      role="status"
    >
      <span className="flex gap-1.5">
        {DELAYS.map((delay) => (
          <span
            className="bg-foreground animate-coach-dot size-1.5 rounded-full motion-reduce:animate-none"
            key={delay}
            style={{ animationDelay: delay }}
          />
        ))}
      </span>
      <MonoLabel className="text-mono-badge">{label}</MonoLabel>
    </div>
  );
}
