import { MonoLabel } from "@/components/mono";
import { ButtonLink } from "@/components/ui/button";
import { signInUrl } from "@/lib/site";

const chapters = [
  {
    label: "01 · Title",
    title: "The card",
    body: "Name, date and time of day, set like a title card.",
  },
  {
    label: "02 · Route",
    title: "The line",
    body: "Your GPS trace draws itself while distance, time and pace count up.",
  },
  {
    label: "03 · Effort",
    title: "The cost",
    body: "Heart rate over the route, split by split — where it got hard.",
  },
  {
    label: "04 · Summary",
    title: "The receipt",
    body: "Four numbers, big enough to read at a glance on a phone.",
  },
];

/** The white catalogue band. `.band-light` flips the token layer, not the copy. */
export function Film() {
  return (
    <section
      id="film"
      className="band-light bg-background text-foreground scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-14">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="font-heading text-display-xl max-w-[700px] text-balance">
            Four chapters, twenty seconds.
          </h2>
          <p className="text-body-lg text-muted-foreground max-w-[340px]">
            Every replay is cut the same way, so the run is the thing that
            changes — not the format.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {chapters.map((chapter) => (
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
          <ButtonLink href={signInUrl}>Make my first replay</ButtonLink>
          <span className="text-body-sm text-muted-foreground">
            Renders at 1080 × 1920 · MP4 download included
          </span>
        </div>
      </div>
    </section>
  );
}
