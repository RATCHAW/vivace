import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ClosingCta } from "@/components/sections/closing-cta";
import { Coach } from "@/components/sections/coach";
import { Film } from "@/components/sections/film";
import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Questions } from "@/components/sections/questions";
import { Sports } from "@/components/sections/sports";

// DESIGN.md's two-mode rhythm: dark storytelling bands (hero, sports,
// questions) slam against white catalogue bands (the film, the coach) with no
// transition between them.
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Film />
        <Sports />
        <Coach />
        <Questions />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
