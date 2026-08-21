/**
 * Every word on the landing page, in English.
 *
 * A plain object rather than i18next, deliberately. The page is Server
 * Components end to end and has to stay prerenderable, so the dictionary is
 * read on the server and only the rendered strings ever reach the browser —
 * there is no runtime, no provider and no hydration cost. `fr.ts` is typed
 * against this object, so the two cannot drift.
 */
export const en = {
  meta: {
    title: "AI Running Coach & Shareable Strava Run Videos | Vivace",
    description:
      "Connect Strava for an AI running coach grounded in your training history, plus shareable run videos with animated routes, pace and heart rate.",
    ogTitle: "Vivace — AI coaching and run videos from your Strava data",
    ogDescription:
      "Get practical training advice from every run, then turn the ones you love into shareable vertical videos.",
    imageAlt:
      "A Vivace coach reply planning Sunday’s long run, beside a run replay showing the route, distance and pace.",
  },

  header: {
    backToTop: "Vivace — home",
    film: "Run replays",
    sports: "Sports",
    coach: "AI coach",
    questions: "Questions",
    logIn: "Log in",
    connectStrava: "Connect Strava",
  },

  language: {
    label: "Language",
    switchTo: "Read this page in {{language}}",
  },

  soon: "Soon",

  hero: {
    badge: "AI coach + run replays · live now",
    titleLine1: "An AI coach for every run.",
    titleLine2: "Replays made to share.",
    body: "Connect Strava for an AI running coach grounded in your full training history, plus vertical run videos with your route, pace and heart rate.",
    primaryCta: "Continue with Strava",
    secondaryCta: "Meet your coach",
    footnote:
      "Free while we’re in alpha. We never post to Strava on your behalf.",
    /**
     * The phone mock-up beside the copy. A staged run rather than a real one,
     * but it is on screen and read out, so it is copy like the rest of it —
     * the numbers it shows live in `lib/replay.ts`, which is maths.
     */
    replay: {
      // The plate is a picture as far as a screen reader is concerned, so this
      // is the only description of it there is.
      alt: "A vertical replay of a 3.16 km evening run: the route draws itself while distance, time, pace and heart rate count up, then the summary card lands.",
      format: "9:16 · Ready for stories",
      date: "5 Aug 2026",
      title: "Evening Run",
      summaryDate: "WED 5 AUG · 8:18 PM",
      time: "Time",
      pace: "Pace",
      bpm: "BPM",
      distance: "Distance",
      elevation: "Elev gain",
    },
  },

  howItWorks: {
    label: "How Vivace works",
    steps: [
      {
        step: "01",
        title: "Connect Strava",
        body: "One tap. It’s the only sign-in — no second password to remember.",
      },
      {
        step: "02",
        title: "Your training, in context",
        body: "Vivace brings your routes, splits, heart rate and recent training into one clear picture.",
      },
      {
        step: "03",
        title: "Choose what comes next",
        body: "Ask the coach what to do next, or turn any run into a vertical video you can share.",
      },
    ],
  },

  film: {
    heading: "Four chapters, twenty seconds.",
    body: "Every replay is cut the same way, so the run is the thing that changes — not the format.",
    chapters: [
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
    ],
    cta: "Make my first replay",
    note: "Renders at 1080 × 1920 · MP4 download included",
  },

  sports: {
    heading: "Runs now. More next.",
    body: "We built the replay for running first because it’s the hardest to make beautiful. The same treatment lands for the rest of your Strava activities as we go.",
    live: "Live",
    items: [
      {
        name: "Run",
        body: "Route, splits, heart rate, elevation.",
        live: true,
      },
      {
        name: "Ride",
        body: "Speed, climbs, power where you have it.",
        live: false,
      },
      {
        name: "Weights",
        body: "Sets, load moved, session volume.",
        live: false,
      },
      {
        name: "Swim & hike",
        body: "Laps, pace per 100 m, trail profile.",
        live: false,
      },
    ],
  },

  coach: {
    badge: "Available now",
    heading: "An AI running coach that has read every run you’ve done.",
    body: "Ask for a training plan, a taper, or an honest read on last week. It uses your Strava history to answer with specific sessions you can run tomorrow.",
    cta: "Try the coach",
    conversation: [
      {
        from: "runner",
        text: "Half marathon in October. I’m at 40 km a week — where do I start?",
      },
      {
        from: "coach",
        text: "Your last four weeks sit at 5:33 /km and barely wobble — that’s a base, so we add volume before speed. Twelve weeks: three easy, one long, tempo from week three.",
      },
      { from: "coach", text: "Week 1 · long run Sunday, 14 km at 6:05 /km." },
    ],
  },

  questions: {
    heading: "Questions runners ask",
    items: [
      {
        q: "Why Strava only?",
        a: "Your runs already live there with GPS and heart rate attached. Signing in with Strava means there’s nothing to import and no data to re-enter.",
      },
      {
        q: "What can the AI running coach help with?",
        a: "It can read your recent training, explain pace and heart-rate patterns, build a week or race plan, adjust a taper and answer questions about a specific run. Its advice is grounded in the Strava history you choose to share.",
      },
      {
        q: "Do you post anything to my Strava?",
        a: "No. We read your activities and never write. You can revoke Vivace in Strava at any time to stop future access, then contact us if you want stored Vivace data and generated files deleted.",
      },
      {
        q: "What if a run has no heart rate or GPS?",
        a: "The film adapts — treadmill runs drop the map chapter and lean on splits and effort instead. Nothing is invented.",
      },
      {
        q: "How is Vivace different from Strava Flyover?",
        a: "Strava Flyover explores an activity on a 3D map inside Strava. Vivace renders a short vertical film from the same run — route, live pace, heart rate and a summary — and hands you a downloadable MP4 to share anywhere. It also reads your training history, so the same run can tell you what to do next.",
      },
      {
        q: "What does it cost?",
        a: "Nothing during the alpha. When pricing lands, the runs you’ve already replayed stay yours.",
      },
    ],
  },

  closingCta: {
    label: "Get started",
    heading: "Every run can guide what comes next.",
    body: "Connect Strava for coaching grounded in your training and vertical replays built from every effort.",
    cta: "Continue with Strava",
  },

  /**
   * The site's own table of contents. It is the body of the 404 and the tail
   * of every Markdown representation, because a person who mistyped a URL and
   * an agent that guessed one need the same thing: the list of what does
   * exist, and where the machine-readable index lives.
   */
  directory: {
    pagesHeading: "Every page on this site",
    agentsHeading: "If you’re an agent or a crawler",
    agentsLead:
      "Each of these describes the whole site in one request. Every page URL also answers to an Accept: text/markdown request, or to the same path with .md on the end.",
    llms: "llms.txt — what Vivace is for, and when to reach for it",
    llmsFull: "llms-full.txt — every page, as one Markdown file",
    sitemap: "sitemap.xml — every URL, in both languages",
  },

  notFound: {
    title: "Page not found | Vivace",
    description:
      "That URL does not exist on vivace.run. Every page on the site is listed here, with the machine-readable index an agent can read instead.",
    eyebrow: "404",
    heading: "That page isn’t here.",
    lead: "Nothing on this site answers to that address. Everything it does have is listed below.",
    backHome: "Back to Vivace",
  },

  footer: {
    tagline: "AI coaching and replays for the runs you already did.",
    logIn: "Log in",
    poweredByStrava: "Powered by Strava",
    copyright: "© {{year}} vivace. Not affiliated with Strava, Inc.",
    product: {
      heading: "Product",
      film: "Run replays",
      sports: "Sports",
      coach: "AI coach",
    },
    company: {
      heading: "Company",
      about: "About",
      questions: "Questions",
      contact: "Contact",
    },
    legal: {
      heading: "Legal",
      privacy: "Privacy",
      terms: "Terms",
      stravaData: "Strava data use",
    },
  },
} as const;

export type Dictionary = typeof en;

/**
 * The dictionary's *shape*, with its literal values widened back to `string`.
 * A translation has to answer every key, but obviously not with the English
 * words — which is what a bare `Dictionary` would demand of it.
 *
 * `boolean` passes through unchanged: `sports.items[].live` is data about which
 * sport is shipped, not copy, and it must stay the same in every language.
 */
export type Translated<T> = T extends string
  ? string
  : T extends boolean
    ? boolean
    : T extends readonly (infer Item)[]
      ? readonly Translated<Item>[]
      : { [K in keyof T]: Translated<T[K]> };
