"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full flex-col gap-2",
      from === "user"
        ? "is-user max-w-[85%] items-end self-end"
        : "is-assistant",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * The athlete's turn is a soft-surface bubble; the coach's is plain type on the
 * canvas. DESIGN.md keeps `--primary` for the one loud control per viewport —
 * here that is the send button, not every line the athlete has ever written.
 */
export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "text-body-md flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-hidden leading-relaxed",
      "group-[.is-user]:bg-secondary group-[.is-user]:text-secondary-foreground group-[.is-user]:rounded-lg group-[.is-user]:rounded-br-sm group-[.is-user]:px-4.5 group-[.is-user]:py-3.5",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

/**
 * Copy, retry and friends — revealed on hover so a read-through stays quiet.
 *
 * A coarse pointer has no hover to reveal them with, and the row is holding its
 * height there either way: on touch they are simply shown.
 */
export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div
    className={cn(
      "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 focus-within:opacity-100",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      {/* Base UI composes with `render`, not Radix's `asChild`. */}
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
};

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Markdown that survives being streamed token by token.
 *
 * The registry wires Streamdown's maths, mermaid and syntax-highlighting
 * plugins; a running coach writes prose, sessions and the odd table, so they
 * are left out rather than pulling katex, mermaid and shiki into the bundle.
 */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // Streamdown ships unstyled block elements; give them the type ramp.
        "[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4",
        "[&_code]:bg-muted [&_code]:rounded-sm [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
        "[&_h1]:font-heading [&_h1]:text-heading-md [&_h2]:font-heading [&_h2]:text-heading-sm [&_h3]:font-heading [&_h3]:text-body-lg [&_h3]:font-semibold",
        "[&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_p]:my-3 [&_strong]:font-semibold",
        "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border-t [&_td]:py-2 [&_td]:pr-4 [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold",
        className,
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn("flex w-full items-center justify-between gap-4", className)}
    {...props}
  >
    {children}
  </div>
);
