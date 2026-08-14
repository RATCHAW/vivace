"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("not-prose w-full rounded-sm border", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

// The registry discriminates this on `type`, which forces every caller to widen
// what `isToolUIPart` already narrowed. One shape, with `toolName` only read for
// dynamic tools, says the same thing without the ceremony.
export type ToolHeaderProps = {
  title?: string;
  className?: string;
  type: ToolPart["type"];
  state: ToolPart["state"];
  /** Only meaningful when `type` is `dynamic-tool`. */
  toolName?: string;
};

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Done",
  "output-denied": "Denied",
  "output-error": "Error",
};

// DESIGN.md keeps accent colours for illustration, which is what a status dot
// is — the surface underneath stays the neutral badge.
const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="text-accent-yellow size-3.5" />,
  "approval-responded": <CheckCircleIcon className="text-brand size-3.5" />,
  "input-available": <ClockIcon className="size-3.5 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-3.5" />,
  "output-available": (
    <CheckCircleIcon className="text-accent-green-text size-3.5" />
  ),
  "output-denied": <XCircleIcon className="text-accent-warning size-3.5" />,
  "output-error": <XCircleIcon className="text-accent-danger size-3.5" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="gap-1.5" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "group/tool hover:bg-muted/40 flex w-full items-center justify-between gap-4 rounded-sm px-4 py-3 outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:ring-inset",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <WrenchIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="text-body-sm truncate font-semibold">
          {title ?? derivedName}
        </span>
        {getStatusBadge(state)}
      </span>
      <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-panel-open/tool:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "flex flex-col gap-4 px-4 pt-1 pb-4 outline-none",
      "data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0",
      className,
    )}
    {...props}
  />
);

/**
 * A tool's payload, verbatim. The registry highlights it with shiki; the coach
 * only ever passes small JSON objects, so a monospaced block earns its place and
 * a syntax highlighter does not.
 */
const Payload = ({ children }: { children: string }) => (
  <pre className="text-caption bg-muted/40 max-h-64 overflow-auto rounded-sm p-3.5 font-mono">
    {children}
  </pre>
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div
    className={cn("flex flex-col gap-2 overflow-hidden", className)}
    {...props}
  >
    <h4 className="text-mono-label text-muted-foreground font-mono uppercase">
      Parameters
    </h4>
    <Payload>{JSON.stringify(input, null, 2)}</Payload>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div className="text-body-sm">{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <Payload>{JSON.stringify(output, null, 2)}</Payload>;
  } else if (typeof output === "string") {
    Output = <Payload>{output}</Payload>;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <h4 className="text-mono-label text-muted-foreground font-mono uppercase">
        {errorText ? "Error" : "Result"}
      </h4>
      {errorText ? (
        <p className="text-body-sm text-destructive">{errorText}</p>
      ) : (
        Output
      )}
    </div>
  );
};
