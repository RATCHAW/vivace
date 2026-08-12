const questions = [
  {
    q: "Why Strava only?",
    a: "Your runs already live there with GPS and heart rate attached. Signing in with Strava means there's nothing to import and no data to re-enter.",
  },
  {
    q: "Do you post anything to my Strava?",
    a: "No. We read your activities and never write. You can disconnect from Strava at any time and your replays go with you.",
  },
  {
    q: "What if a run has no heart rate or GPS?",
    a: "The film adapts — treadmill runs drop the map chapter and lean on splits and effort instead. Nothing is invented.",
  },
  {
    q: "What does it cost?",
    a: "Nothing during the alpha. When pricing lands, the runs you've already replayed stay yours.",
  },
];

export function Questions() {
  return (
    <section
      id="questions"
      className="scroll-mt-16 px-6 py-20 sm:px-8 sm:py-30"
    >
      <div className="mx-auto grid w-full max-w-[1200px] items-start gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-18">
        <h2 className="font-heading text-display-lg">Questions runners ask</h2>

        <div className="flex flex-col">
          {questions.map((item, i) => (
            <div
              key={item.q}
              className={`flex flex-col gap-2.5 border-t py-7 ${
                i === questions.length - 1 ? "border-b" : ""
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
