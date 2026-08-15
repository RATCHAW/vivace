import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@/lib/utils";

/**
 * A scroll container with an overlay scrollbar.
 *
 * The scrollbar is absolutely positioned by Base UI and unmounts when the
 * content fits, so a panel that doesn't overflow reserves no gutter and shows
 * no rail — which is what makes it safe to nest one of these inside a fixed
 * column instead of letting the column scroll itself.
 */
function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn("relative", className)}
      data-slot="scroll-area"
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] outline-none focus-visible:ring-3"
        data-slot="scroll-area-viewport"
      >
        {/* `Content` is what watches the content for size changes: without it
            the overflow state is measured once, and a list that fills up after
            the first paint never gets a rail. Its own `min-width: fit-content`
            is for horizontally scrolling content and would stretch a column
            past its viewport — undo it, or a `truncate` stops truncating. */}
        <ScrollAreaPrimitive.Content style={{ minWidth: 0 }}>
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        // Arrives in 150ms, leaves in 300ms: the rail should answer the pointer
        // at once and then get out of the way without a blink, which is also
        // what keeps it from flickering between two scrolls of the same list.
        "flex touch-none p-px opacity-0 transition-opacity duration-300 ease-out select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-hovering:opacity-100 data-hovering:duration-150 data-scrolling:opacity-100 data-scrolling:duration-150 data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className,
      )}
      data-orientation={orientation}
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className="bg-muted-foreground/30 relative flex-1 rounded-full"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
