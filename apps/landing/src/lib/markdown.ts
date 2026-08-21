/**
 * Every page, rendered a second time as Markdown.
 *
 * Not a conversion of the HTML — a second rendering of the same catalogue. The
 * dictionary is already the source of truth for what each page says, so a
 * document assembled from it can never drift from the one a browser gets, and
 * a reworded sentence changes both at once. That is the whole reason this
 * exists as pure functions rather than as a `turndown` pass over the markup.
 *
 * These are what `Accept: text/markdown` returns, what the `.md` sibling URLs
 * serve, and what `llms-full.txt` is made of. The heading hierarchy mirrors the
 * page exactly — one H1, an H2 per section, an H3 per item — so an agent that
 * reads either one gets the same shape.
 */
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";
import { getContentPage, type ContentPage } from "@/i18n/content-pages";
import { fill, getDictionary, type Copy } from "@/i18n/dictionaries";
import { absoluteSiteUrl } from "@/lib/metadata";
import {
  pageName,
  pagePaths,
  pageSummary,
  SITE_PAGES,
  type Page,
} from "@/lib/pages";
import { coachUrl, signInUrl } from "@/lib/site";

/** Blocks, in order, with the blanks dropped — the shape of every builder here. */
function blocks(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join("\n\n");
}

function link(label: string, href: string): string {
  return `[${label}](${href})`;
}

/**
 * A link list entry with a note, which is llms.txt's `[name](url): notes` and
 * reads the same anywhere else.
 */
function entry(label: string, href: string, note?: string): string {
  return note ? `- ${link(label, href)}: ${note}` : `- ${link(label, href)}`;
}

/** The tail every representation carries: what else exists, and where to look. */
export function directoryMarkdown(locale: Locale, current?: Page): string {
  const copy = getDictionary(locale);
  const t = copy.directory;

  const others = SITE_PAGES.filter(
    (page) => !current || pageKeyOf(page) !== pageKeyOf(current),
  ).map((page) =>
    entry(
      pageName(locale, page),
      absoluteSiteUrl(pagePaths(page)[locale]),
      pageSummary(locale, page),
    ),
  );

  const translations = LOCALES.filter((other) => other !== locale).map(
    (other) =>
      entry(
        fill(copy.language.switchTo, { language: LOCALE_LABELS[other] }),
        absoluteSiteUrl(pagePaths(current ?? { kind: "home" })[other]),
      ),
  );

  return blocks(
    "---",
    `## ${t.pagesHeading}`,
    [...others, ...translations].join("\n"),
    `## ${t.agentsHeading}`,
    t.agentsLead,
    [
      entry(t.llms, absoluteSiteUrl("/llms.txt")),
      entry(t.llmsFull, absoluteSiteUrl("/llms-full.txt")),
      entry(t.sitemap, absoluteSiteUrl("/sitemap.xml")),
    ].join("\n"),
  );
}

function pageKeyOf(page: Page): string {
  return page.kind === "home" ? "home" : page.key;
}

/** The home page: the hero, the four sections below it, and the six answers. */
function homeMarkdown(locale: Locale): string {
  const copy: Copy = getDictionary(locale);

  return blocks(
    `# ${copy.hero.titleLine1} ${copy.hero.titleLine2}`,
    `> ${copy.meta.description}`,
    copy.hero.body,
    [
      entry(copy.hero.primaryCta, signInUrl(locale)),
      entry(copy.hero.secondaryCta, coachUrl(locale)),
    ].join("\n"),
    copy.hero.footnote,

    `## ${copy.howItWorks.label}`,
    copy.howItWorks.steps
      .map((step) => `### ${step.step} — ${step.title}\n\n${step.body}`)
      .join("\n\n"),

    `## ${copy.coach.heading}`,
    copy.coach.body,
    entry(copy.coach.cta, coachUrl(locale)),

    `## ${copy.sports.heading}`,
    copy.sports.body,
    copy.sports.items
      .map(
        (item) =>
          `- **${item.name}** (${item.live ? copy.sports.live : copy.soon}): ${item.body}`,
      )
      .join("\n"),

    `## ${copy.film.heading}`,
    copy.film.body,
    copy.film.chapters
      .map(
        (chapter) =>
          `### ${chapter.label} — ${chapter.title}\n\n${chapter.body}`,
      )
      .join("\n\n"),
    copy.film.note,

    `## ${copy.questions.heading}`,
    copy.questions.items
      .map((item) => `### ${item.q}\n\n${item.a}`)
      .join("\n\n"),

    `## ${copy.closingCta.heading}`,
    copy.closingCta.body,
    entry(copy.closingCta.cta, signInUrl(locale)),
  );
}

function contentSectionsMarkdown(page: ContentPage): string {
  return page.sections
    .map((section) =>
      blocks(
        `## ${section.heading}`,
        section.paragraphs.join("\n\n"),
        section.bullets?.map((bullet) => `- ${bullet}`).join("\n"),
        section.links?.map((item) => entry(item.label, item.href)).join("\n"),
      ),
    )
    .join("\n\n");
}

/** About, Contact, Privacy, Terms, Strava data use — all one shape. */
function contentPageMarkdown(locale: Locale, page: ContentPage): string {
  return blocks(
    `# ${page.heading}`,
    `> ${page.lead}`,
    page.updated && `_${page.updated}_`,
    contentSectionsMarkdown(page),
  );
}

/**
 * One page as a document.
 *
 * The directory tail is optional because `llms-full.txt` concatenates all
 * twelve of these, and repeating "here is every other page" twelve times is
 * context an agent pays for and cannot use.
 */
export function pageMarkdown(
  locale: Locale,
  page: Page,
  { directory = true }: { directory?: boolean } = {},
): string {
  const body =
    page.kind === "home"
      ? homeMarkdown(locale)
      : contentPageMarkdown(locale, getContentPage(locale, page.key));

  return directory ? blocks(body, directoryMarkdown(locale, page)) : body;
}

/**
 * What a 404 returns to a client that asked for Markdown.
 *
 * Same words as the rendered 404, and the same list — an agent that guessed a
 * URL wrong should be able to recover from the response body alone rather than
 * having to go back and crawl.
 */
export function notFoundMarkdown(locale: Locale): string {
  const copy = getDictionary(locale);

  return blocks(
    `# ${copy.notFound.heading}`,
    `> ${copy.notFound.lead}`,
    directoryMarkdown(locale),
  );
}

/**
 * Every page in every language, end to end, for `llms-full.txt`.
 *
 * Each document is stamped with the URL it was rendered from, so an agent that
 * reads the whole file can still cite a page rather than the bundle.
 */
export function fullMarkdown(): string {
  return LOCALES.flatMap((locale) =>
    SITE_PAGES.map((page) =>
      blocks(
        `<!-- ${absoluteSiteUrl(pagePaths(page)[locale])} -->`,
        pageMarkdown(locale, page, { directory: false }),
      ),
    ),
  ).join("\n\n---\n\n");
}
