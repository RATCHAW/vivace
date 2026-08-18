import { expect, test, type Page } from "@playwright/test";
import {
  ATHLETES,
  DECOY_RUN,
  SHARED_RUN,
  SHARED_RUN_SAM,
} from "../athletes.js";

/**
 * Two athletes, one film — the whole invitation, through the browser.
 *
 * Nothing here reaches into the database or forges a session. Both athletes
 * sign in through better-auth's real OAuth against the Strava the suite owns,
 * which is what makes this worth more than the API-level tests beside it: the
 * part of this feature most likely to break is the handoff, where somebody who
 * has never heard of Vivace opens a link and is asked for a Strava account.
 */

/** `?lang=en` on every navigation: the catalogue is EN/FR and the assertions
 *  are English, so the language is pinned rather than left to the browser. */
function url(path: string): string {
  return path.includes("?") ? `${path}&lang=en` : `${path}?lang=en`;
}

/** Sign in from wherever we are, as one of the fixture athletes. */
async function signIn(
  page: Page,
  athlete: keyof typeof ATHLETES,
): Promise<void> {
  await page.getByRole("button", { name: "Continue with Strava" }).click();
  // Strava's consent screen, as the suite's own two buttons.
  await page.locator(`#authorize-${ATHLETES[athlete].key}`).click();
}

test("an athlete invites the person they ran with, who accepts", async ({
  browser,
}) => {
  const inviter = await browser.newContext();
  const invitee = await browser.newContext();

  try {
    // --- Ayoub signs in and opens the run they did together -----------------
    const ayoub = await inviter.newPage();
    await ayoub.goto(url("/"));
    await signIn(ayoub, "ayoub");
    await expect(ayoub).toHaveURL(/\/$|\/\?/);

    await ayoub.goto(url(`/replays?run=${SHARED_RUN.id}`));
    // `.first()` rather than an `.or()` of a heading and a text match: the run's
    // name appears both in the list rail and in the studio beside it, and a
    // locator that is unique only some of the time is a flaky test waiting to
    // happen — it was, once.
    await expect(ayoub.getByText(SHARED_RUN.name).first()).toBeVisible();

    // --- and invites somebody to it ----------------------------------------
    // The token is read off the API response rather than the clipboard: the
    // component hands the link to `navigator.share` first and the clipboard
    // only as a fallback, and which of those runs is the browser's business.
    const created = ayoub.waitForResponse(
      (response) =>
        response.url().includes(`/api/runs/${SHARED_RUN.id}/invite`) &&
        response.request().method() === "POST",
    );
    await ayoub.getByRole("button", { name: "Add who you ran with" }).click();
    const token = ((await (await created).json()) as { token: string }).token;
    expect(token).toBeTruthy();

    // The studio now says it is waiting on somebody.
    await expect(
      ayoub.getByRole("button", { name: "Copy the link again" }),
    ).toBeVisible();

    // --- Sam opens the link, having never been here ------------------------
    const sam = await invitee.newPage();
    await sam.goto(url(`/invite/${token}`));

    // Who is asking and which run — before anything is asked of them.
    await expect(
      sam.getByRole("heading", {
        name: `${ATHLETES.ayoub.firstname} wants you in their run video`,
      }),
    ).toBeVisible();
    await expect(sam.getByText(SHARED_RUN.name)).toBeVisible();

    // --- and signs in, landing back on the invitation ----------------------
    await sam.getByRole("link", { name: "Continue with Strava" }).click();
    await expect(sam).toHaveURL(/\/login/);
    await signIn(sam, "sam");
    await expect(sam).toHaveURL(new RegExp(`/invite/${token}`));

    // --- the right run is offered, the decoy is not ------------------------
    await expect(
      sam.getByRole("heading", { name: "Which run was yours?" }),
    ).toBeVisible();
    await expect(sam.getByText(SHARED_RUN_SAM.name)).toBeVisible();
    // Same day, twelve hours later.
    //
    // Two independent gates keep it out — the half-hour start window, and the
    // requirement that the two runs actually overlapped — and this was checked
    // by removing them: either one alone still excludes it, and only removing
    // *both* makes this assertion fail. Worth knowing before "simplifying"
    // either of them on the grounds that the other covers it.
    await expect(sam.getByText(DECOY_RUN.name)).toHaveCount(0);

    // --- accepting is one tap ----------------------------------------------
    await sam.getByText(SHARED_RUN_SAM.name).click();
    await sam.getByRole("button", { name: "Make the video together" }).click();
    await expect(sam.getByText("You're in")).toBeVisible();

    // --- and Ayoub sees it -------------------------------------------------
    await ayoub.reload();
    await expect(
      ayoub.getByText(`${ATHLETES.sam.firstname} is in`),
    ).toBeVisible();
  } finally {
    await inviter.close();
    await invitee.close();
  }
});

test("an athlete cannot accept their own invitation", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const ayoub = await context.newPage();
    await ayoub.goto(url("/"));
    await signIn(ayoub, "ayoub");

    // Straight to the API for the link: this test is about what the *invite*
    // page does with it, and re-driving the studio would be re-testing the
    // case above.
    const response = await ayoub.request.post(
      `/api/runs/${ATHLETES.ayoub.runs[1].id}/invite`,
    );
    expect(response.status()).toBe(200);
    const { token } = (await response.json()) as { token: string };

    await ayoub.goto(url(`/invite/${token}`));
    await expect(
      ayoub.getByText("This is your own invitation").first(),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a link that was never minted is refused", async ({ page }) => {
  await page.goto(url(`/invite/${"z".repeat(43)}`));
  await expect(page.getByText("This invitation is not valid")).toBeVisible();
});
