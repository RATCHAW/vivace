import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";

import { i18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        // Heavier than the dialog's scrim on purpose: the panel below is the
        // canvas, so the page behind it has to stop reading as canvas too.
        "fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 supports-backdrop-filter:backdrop-blur-xs data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The panel itself.
 *
 * It travels its own full width rather than the registry's 2.5rem, because the
 * shorter throw reads as a card fading in near an edge instead of a surface
 * arriving from beyond it — and once it clears the edge the opacity fade is
 * doing no work, so there isn't one. `transform` only: opacity would make the
 * slide look like it is being watched through a dissolve. Fixed positioning is
 * why an off-canvas panel can't add to the page's scrollable width.
 *
 * No shadow — DESIGN.md carries elevation on surface luminance and a hairline,
 * and the panel is the *canvas* rather than the registry's `bg-popover`. That
 * matters more than it sounds: in dark mode `--popover`, `--card`, `--muted`
 * and `--secondary` are all `surface-elevated`, so a selected row drawn on an
 * elevated panel is the same colour as the panel. A sheet here stands in for a
 * column of the page, and a column sits on the canvas behind a hairline — put
 * it on the canvas and everything inside keeps the contrast it was drawn for.
 */
const sheetVariants = cva(
  "fixed z-50 flex flex-col bg-background bg-clip-padding text-body-md text-foreground transition-transform duration-200 ease-drawer",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 h-auto border-b data-ending-style:-translate-y-full data-starting-style:-translate-y-full",
        right:
          "inset-y-0 right-0 h-full w-[86%] border-l sm:max-w-sm data-ending-style:translate-x-full data-starting-style:translate-x-full",
        bottom:
          "inset-x-0 bottom-0 h-auto border-t data-ending-style:translate-y-full data-starting-style:translate-y-full",
        left: "inset-y-0 left-0 h-full w-[86%] border-r sm:max-w-sm data-ending-style:-translate-x-full data-starting-style:-translate-x-full",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props &
  VariantProps<typeof sheetVariants> & {
    showCloseButton?: boolean;
  }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">{i18n.t("common.close")}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex shrink-0 flex-col gap-0.5 px-5 py-4", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-6", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex shrink-0 flex-col gap-2 px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-body-md font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-body-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
