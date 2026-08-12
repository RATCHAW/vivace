import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The DESIGN.md type ramp and brand colours are custom theme namespaces
// (`--text-*`, `--color-*` in styles.css). tailwind-merge has to be told about
// them, otherwise it reads `text-body-md` as a *colour* utility and lets it
// clobber `text-primary-foreground` when the two meet in one cn() call.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display-xxl",
        "display-xl",
        "display-lg",
        "display-md",
        "heading-lg",
        "heading-md",
        "heading-sm",
        "body-lg",
        "body-md",
        "body-sm",
        "caption",
        "mono-label",
        "mono-badge",
      ],
      color: [
        "stone",
        "brand",
        "brand-foreground",
        "brand-bright",
        "brand-deep",
        "divider-soft",
        "strava",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
