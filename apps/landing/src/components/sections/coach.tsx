import { BrandBadge } from "@/components/mono";
import { ButtonLink } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Copy } from "@/i18n/dictionaries";
import { coachUrl } from "@/lib/site";

export function Coach({ copy, locale }: { copy: Copy; locale: Locale }) {
  const t = copy.coach;

  return (
    <section
      id="coach"
      className="band-light bg-background text-foreground scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30"
    >
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-18">
        <div className="flex flex-col gap-7">
          <BrandBadge>{t.badge}</BrandBadge>
          <h2 className="font-heading text-display-xl text-balance">
            {t.heading}
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-[520px]">
            {t.body}
          </p>

          <ButtonLink className="self-start" href={coachUrl(locale)}>
            {t.cta}
          </ButtonLink>
        </div>

        <div className="bg-muted flex flex-col gap-4 rounded-lg border p-7">
          {t.conversation.map((message, i) => (
            <div
              key={i}
              className={
                message.from === "runner"
                  ? "bg-primary text-primary-foreground text-body-sm max-w-[78%] self-end rounded-[20px_20px_8px_20px] px-4.5 py-3.5"
                  : "bg-card text-card-foreground text-body-sm max-w-[88%] self-start rounded-[20px_20px_20px_8px] border px-4.5 py-3.5"
              }
            >
              {message.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
