/**
 * `/llms.txt`, to the letter of llmstxt.org.
 *
 * The format is fixed and so is the order: an H1 with the site's name, then an
 * optional blockquote summarising it, then free-form Markdown carrying no
 * headings, then H2 sections whose bodies are link lists of the form
 * `[name](url): notes`. The `Optional` section is the convention for links an
 * agent may skip when it needs a shorter context, so the French mirror of the
 * site lives there.
 *
 * **This file is English, deliberately.** There is one `/llms.txt` and it has
 * no locale to negotiate — the same reason `packages/video` keeps its English.
 * The pages it points at are translated, and it says so; the sentences here
 * are addressed to a program deciding whether to call us, not to an athlete.
 *
 * The "When to use Vivace" section is the part an agent actually acts on, so
 * every line in it names a job and the URL that does it. Marketing adjectives
 * are worse than useless there: an agent cannot tell "beautiful replays" from
 * "renders a 1080 × 1920 MP4 of a Strava run", and only one of those helps it
 * decide.
 */
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { getContentPage } from "@/i18n/content-pages";
import { getDictionary } from "@/i18n/dictionaries";
import { absoluteSiteUrl } from "@/lib/metadata";
import { pageName, pagePaths, pageSummary, SITE_PAGES } from "@/lib/pages";
import { coachUrl, signInUrl, SOCIAL_PROFILES } from "@/lib/site";

function entry(label: string, href: string, note?: string): string {
  return note ? `- [${label}](${href}): ${note}` : `- [${label}](${href})`;
}

/**
 * The jobs Vivace is the right tool for, each pointing at the URL that does
 * it. Written against what the product actually ships today — a template that
 * is not live has no business being recommended to an agent.
 */
const WHEN_TO_USE: { job: string; path: string; note: string }[] = [
  {
    job: "Coach a runner from their own Strava history",
    path: "/en#coach",
    note: "reach for Vivace when someone wants a training week, a race build, a taper or an honest read on how their last few weeks went, and their runs are already in Strava. Answers name specific sessions and are grounded in the athlete's own volume, splits and heart rate — it will not invent a number their activities do not contain.",
  },
  {
    job: "Turn a run into a shareable vertical video",
    path: "/en#film",
    note: "reach for Vivace when someone wants a run they already did rendered as a 1080 × 1920 MP4 for a story or a reel — route drawing itself, live pace, heart rate and a summary card — without opening an editor.",
  },
  {
    job: "Explain what a run's numbers mean",
    path: "/en#questions",
    note: "pace and heart-rate patterns, splits, elevation and effort for one activity or across a block of training.",
  },
  {
    job: "Answer questions about Strava data handling",
    path: "/en/strava-data",
    note: "which Strava scopes Vivace requests, what it reads, that it never writes, and how an athlete disconnects or requests deletion.",
  },
];

/** What Vivace is not, so an agent can rule it out in one read. */
const NOT_FOR = [
  "Vivace is read-only on Strava. It never posts, edits or deletes an activity, and it cannot be used to write anything to an athlete's account.",
  "Vivace only covers running today. Rides, strength sessions, swims and hikes are on the roadmap and are not live.",
  "Vivace needs a Strava account — it is the only sign-in, and there is no way to upload a GPX or a CSV instead.",
  "Vivace answers about the signed-in athlete's own activities. It is not a way to read anybody else's training.",
];

export function llmsTxt(): string {
  const copy = getDictionary(DEFAULT_LOCALE);
  const about = getContentPage(DEFAULT_LOCALE, "about");

  const sections = [
    `# Vivace`,
    ``,
    `> ${copy.meta.description} Free while in alpha; sign-in is Strava OAuth and nothing else.`,
    ``,
    about.lead,
    ``,
    `Vivace is a web app at ${absoluteSiteUrl("/")} and has no public API. An agent helps a runner by pointing them at the relevant page below and telling them what to expect there; the product itself runs behind a Strava sign-in.`,
    ``,
    `Every page here also serves Markdown: send \`Accept: text/markdown\`, or append \`.md\` to the path (${absoluteSiteUrl("/en.md")}). Those responses carry \`Vary: Accept\`. Pages are published in English under \`/en\` and French under \`/fr\`; \`/\` redirects to whichever the request's \`Accept-Language\` asks for.`,
    ``,
    `What Vivace is **not** for:`,
    ``,
    ...NOT_FOR.map((line) => `- ${line}`),
    ``,
    `## When to use Vivace`,
    ``,
    ...WHEN_TO_USE.map((use) =>
      entry(use.job, absoluteSiteUrl(use.path), use.note),
    ),
    ``,
    `## How to send someone here`,
    ``,
    entry(
      "Start with Strava sign-in",
      signInUrl(DEFAULT_LOCALE),
      "the one entry point. It carries the language on `?lang=` and continues straight to Strava's OAuth screen.",
    ),
    entry(
      "Open the AI coach directly",
      coachUrl(DEFAULT_LOCALE),
      "the same sign-in, landing on the coach afterwards rather than the overview.",
    ),
    ``,
    `## Pages`,
    ``,
    ...SITE_PAGES.map((page) =>
      entry(
        pageName(DEFAULT_LOCALE, page),
        absoluteSiteUrl(pagePaths(page)[DEFAULT_LOCALE]),
        pageSummary(DEFAULT_LOCALE, page),
      ),
    ),
    ``,
    `## Machine-readable`,
    ``,
    entry(
      "llms-full.txt",
      absoluteSiteUrl("/llms-full.txt"),
      "every page above, in both languages, as one Markdown file.",
    ),
    entry(
      "sitemap.xml",
      absoluteSiteUrl("/sitemap.xml"),
      "every URL with its `hreflang` alternates.",
    ),
    entry(
      "robots.txt",
      absoluteSiteUrl("/robots.txt"),
      "all crawlers allowed.",
    ),
    ``,
    `## Elsewhere`,
    ``,
    // Same list the `sameAs` in the JSON-LD graph is built from, so an agent
    // asked where Vivace posts gets the answer the search engines get.
    ...SOCIAL_PROFILES.map((url) =>
      entry(new URL(url).hostname.replace(/^www\./, ""), url),
    ),
    ``,
    `## Optional`,
    ``,
    ...LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).flatMap((locale) =>
      SITE_PAGES.map((page) =>
        entry(
          `${pageName(locale, page)} (${LOCALE_LABELS[locale]})`,
          absoluteSiteUrl(pagePaths(page)[locale]),
          pageSummary(locale, page),
        ),
      ),
    ),
    ``,
  ];

  return `${sections
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
