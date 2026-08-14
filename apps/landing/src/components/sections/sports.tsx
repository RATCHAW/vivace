import { BrandBadge, SoonBadge } from "@/components/mono";
import type { Copy } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function Sports({ copy }: { copy: Copy }) {
  const t = copy.sports;

  return (
    <section id="sports" className="scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-12">
        <div className="flex max-w-[720px] flex-col gap-5">
          <h2 className="font-heading text-display-xl text-balance">
            {t.heading}
          </h2>
          <p className="text-body-lg text-muted-foreground">{t.body}</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.items.map((sport) => (
            <div
              key={sport.name}
              className="bg-card flex min-h-[200px] flex-col gap-3 rounded-lg p-8"
            >
              {/* `live` is data, not copy — which sport has shipped is the same
                  fact in every language, and the type keeps it a boolean. */}
              {sport.live ? (
                <BrandBadge>{t.live}</BrandBadge>
              ) : (
                <SoonBadge>{copy.soon}</SoonBadge>
              )}
              <h3
                className={cn(
                  "text-heading-lg mt-2",
                  !sport.live && "text-foreground/40",
                )}
              >
                {sport.name}
              </h3>
              <p
                className={cn(
                  "text-body-md",
                  sport.live ? "text-muted-foreground" : "text-stone",
                )}
              >
                {sport.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
