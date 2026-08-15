import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// DESIGN.md: every button is a pill ({rounded.full}) and ships at a minimum of
// 48px tall. Labels are Inter {typography.button-md} (16/600, +0.24px tracking);
// the hero size steps up to {typography.button-lg} (20/500).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        // button-primary (white pill on dark) / button-dark (dark pill on light)
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        // button-outline-light / button-outline-dark — a full-strength 1px rule
        outline:
          "border-foreground bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
        // The same pill drawn on {colors.hairline-dark} instead. For the ring of
        // secondary controls around a piece of content — player transport, back
        // arrows, Share — where a full-strength rule would outshout the content.
        subtle:
          "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        // button-soft — surface-soft ground
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        // 48px tall, 14px/28px padding — the documented default
        default:
          "h-12 gap-2 px-7 text-body-md has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        // button-pill-sm — 36px, bumped to 44px on touch via min-h
        sm: "h-9 min-h-11 gap-1.5 px-4 text-body-sm sm:min-h-9 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        xs: "h-8 gap-1 px-3 text-caption [&_svg:not([class*='size-'])]:size-3.5",
        // button-lg — hero CTA, {typography.button-lg}
        lg: "h-14 gap-2.5 px-8 text-heading-sm font-medium has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6 [&_svg:not([class*='size-'])]:size-6",
        icon: "size-12",
        // The same 48px pill, filling the column it is handed instead of being
        // a square. For a row of icon actions laid out on a grid — the studio's
        // Share / Coach / Options / Download under the film on a phone — where
        // the cells have to divide the film's width evenly rather than each
        // keep the `icon` measure and leave the gaps uneven.
        "icon-fill": "h-12 w-full",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        // The touch bump is on both axes: a 36×44 pill is a lopsided oval the
        // moment the variant carries a border, and a 36px-wide tap target is
        // the half of the 44px rule that actually gets missed.
        "icon-sm":
          "size-9 min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-14 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
