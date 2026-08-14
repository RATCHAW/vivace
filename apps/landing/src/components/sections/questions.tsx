import type { Copy } from "@/i18n/dictionaries";

export function Questions({ copy }: { copy: Copy }) {
  const t = copy.questions;

  return (
    <section
      id="questions"
      className="scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30"
    >
      <div className="mx-auto grid w-full max-w-[1200px] items-start gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-18">
        <h2 className="font-heading text-display-lg">{t.heading}</h2>

        <div className="flex flex-col">
          {t.items.map((item, i) => (
            <div
              key={item.q}
              className={`flex flex-col gap-2.5 border-t py-7 ${
                i === t.items.length - 1 ? "border-b" : ""
              }`}
            >
              <h3 className="text-heading-sm">{item.q}</h3>
              <p className="text-body-md text-muted-foreground max-w-[620px]">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
