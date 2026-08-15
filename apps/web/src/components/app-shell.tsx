import { type ReactNode } from "react";
import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";

/**
 * Header, page, footer — the frame every scrolling surface sits in.
 *
 * `min-h-svh` with the footer on `mt-auto` is what keeps the rule at the
 * bottom of the *viewport* on a short page rather than floating halfway up it.
 *
 * The Coach deliberately does not use this: it is a fixed-height workspace
 * (`h-[calc(100svh-4rem)]`, with its own scroll regions inside) and a footer
 * below it would make the whole document scroll to reach a link. It reaches
 * the same pages through the avatar menu instead.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      {children}
      <AppFooter />
    </div>
  );
}
