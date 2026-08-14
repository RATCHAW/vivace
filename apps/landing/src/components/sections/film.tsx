import { MonoLabel } from "@/components/mono";
import { ButtonLink } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Copy } from "@/i18n/dictionaries";
import { signInUrl } from "@/lib/site";

/** The white catalogue band. `.band-light` flips the token layer, not the copy. */
export function Film({ copy, locale }: { copy: Copy; locale: Locale }) {
  const t = copy.film;

  return (
    <section
      id="film"
      className="band-light bg-background text-foreground scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-14">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="font-heading text-display-xl max-w-[700px] text-balance">
            {t.heading}
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-[340px]">
            {t.body}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.chapters.map((chapter) => (
            <div
              key={chapter.label}
              className="bg-card flex flex-col gap-3 rounded-lg border p-8"
            >
              <MonoLabel>{chapter.label}</MonoLabel>
              <h3 className="text-heading-md">{chapter.title}</h3>
              <p className="text-body-md text-muted-foreground">
                {chapter.body}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-6 border-t pt-6">
          <ButtonLink href={signInUrl(locale)}>{t.cta}</ButtonLink>
          <span className="text-body-sm text-muted-foreground">{t.note}</span>
        </div>
      </div>
    </section>
  );
}
