import { expect, test, type Page } from "@playwright/test";
import { ATHLETES } from "../athletes.js";

/**
 * The composer's two lists, driven from the keyboard, in a real browser.
 *
 * jsdom can be told what the caret is; a browser has one. Everything here
 * turns on that — whether typing `@` opens the list, whether the arrows move a
 * highlight instead of the caret, and whether the click that opens the list
 * from the button leaves the athlete still typing where they were. None of it
 * is observable without a real text field, which is why this is here and not
 * beside the component.
 */

const AYOUB = ATHLETES.ayoub;
const LONG_RUN = AYOUB.runs[0];
const EASY_RUN = AYOUB.runs[1];

/** `?lang=en` on every navigation: the assertions are English. */
function url(path: string): string {
  return path.includes("?") ? `${path}&lang=en` : `${path}?lang=en`;
}

async function signIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue with Strava" }).click();
  await page.locator(`#authorize-${AYOUB.key}`).click();
}

/** The composer's box — a combobox, because it drives the two lists. */
function composer(page: Page) {
  return page.getByRole("combobox", { name: /Ask about a run/ });
}

/** What `aria-activedescendant` is pointing at, as the athlete would read it. */
async function highlighted(page: Page): Promise<string> {
  const id = await composer(page).getAttribute("aria-activedescendant");
  if (!id) return "";
  return (await page.locator(`#${id}`).textContent()) ?? "";
}

/** The two themes, because the highlight has to survive both canvases. */
async function useTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((next) => {
    localStorage.setItem("vite-ui-theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  }, theme);
}

test.describe("the coach composer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(url("/"));
    await signIn(page);
    await expect(page).toHaveURL(/\/$|\/\?/);
  });

  test("Ask the coach opens a conversation of its own, naming the run", async ({
    page,
  }) => {
    await page.goto(url(`/replays?run=${LONG_RUN.id}`));
    await page.getByRole("link", { name: "Ask the coach" }).first().click();

    await expect(page).toHaveURL(/\/coach\?/);
    // A blank page, not whatever was said last: the coach reads a thread's
    // history, so a question about this run must not arrive under somebody
    // else's week.
    await expect(
      page.getByRole("heading", { name: "What are we training for?" }),
    ).toBeVisible();
    // And the run came with it, without the athlete naming it.
    await expect(
      page.getByRole("button", { name: "Remove the attached run" }),
    ).toBeVisible();
    await expect(page.getByText(LONG_RUN.name).last()).toBeVisible();
  });

  test("a typed `@` opens the run list, and the arrows walk it", async ({
    page,
  }) => {
    await page.goto(url("/coach"));
    await composer(page).click();
    await composer(page).pressSequentially("@");

    const list = page.getByRole("listbox", { name: "Runs you can attach" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(AYOUB.runs.length);

    // The first row is armed, so Enter attaches without an arrow press first.
    expect(await highlighted(page)).toContain(LONG_RUN.name);

    await composer(page).press("ArrowDown");
    expect(await highlighted(page)).toContain(EASY_RUN.name);

    // Wrapping, both ways.
    await composer(page).press("ArrowDown");
    expect(await highlighted(page)).toContain(LONG_RUN.name);
    await composer(page).press("ArrowUp");
    expect(await highlighted(page)).toContain(EASY_RUN.name);

    // Enter takes the highlighted run and cuts the `@` back out of the draft.
    await composer(page).press("Enter");
    await expect(list).toBeHidden();
    await expect(composer(page)).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Remove the attached run" }),
    ).toBeVisible();
  });

  test("the mention filters, and comes out of the middle of a question", async ({
    page,
  }) => {
    await page.goto(url("/coach"));
    await composer(page).click();
    await composer(page).pressSequentially("why did I fade on @tuesday");

    const list = page.getByRole("listbox", { name: "Runs you can attach" });
    await expect(list.getByRole("option")).toHaveCount(1);
    expect(await highlighted(page)).toContain(EASY_RUN.name);

    await composer(page).press("Enter");
    // The chip carries the run now, so the words that found it are gone and
    // the caret is back where they were typed.
    await expect(composer(page)).toHaveValue("why did I fade on ");
  });

  test("Escape closes the list and keeps what was typed", async ({ page }) => {
    await page.goto(url("/coach"));
    await composer(page).click();
    await composer(page).pressSequentially("@sat");

    const list = page.getByRole("listbox", { name: "Runs you can attach" });
    await expect(list).toBeVisible();

    await composer(page).press("Escape");
    await expect(list).toBeHidden();
    await expect(composer(page)).toHaveValue("@sat");
    await expect(composer(page)).toBeFocused();
  });

  test("the `@` button opens the same list and hands the caret back", async ({
    page,
  }) => {
    await page.goto(url("/coach"));
    await page.getByRole("button", { name: "Attach a run" }).click();

    const list = page.getByRole("listbox", { name: "Runs you can attach" });
    await expect(list).toBeVisible();
    // Nothing armed — the athlete may already have a question written.
    await expect(composer(page)).not.toHaveAttribute("aria-activedescendant");
    // But the arrows work, because the caret came straight back to the box.
    await expect(composer(page)).toBeFocused();

    await composer(page).press("ArrowDown");
    expect(await highlighted(page)).toContain(LONG_RUN.name);
    await composer(page).press("Enter");

    await expect(list).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Remove the attached run" }),
    ).toBeVisible();
  });

  /**
   * The highlight has to be *seen*, on either canvas.
   *
   * This shipped once as `bg-muted` over `bg-card`, which is four per cent of
   * luminance on the light canvas and — because `--muted` and `--card` are the
   * same colour there — nothing whatsoever on the dark one. The arrows worked
   * and the ARIA was right; the athlete simply could not tell which row they
   * were on. Only a browser can catch that, so it is caught here.
   */
  for (const theme of ["light", "dark"] as const) {
    test(`the highlighted row is visibly the highlighted row in ${theme}`, async ({
      page,
    }) => {
      await page.goto(url("/coach"));
      await useTheme(page, theme);
      await composer(page).click();
      await composer(page).pressSequentially("@");

      const rows = page.getByRole("option");
      await expect(rows).toHaveCount(AYOUB.runs.length);
      const paint = (row: number) =>
        rows.nth(row).evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          tick: getComputedStyle(el.firstElementChild!).opacity,
        }));

      const [active, resting] = [await paint(0), await paint(1)];
      // A tint the resting rows don't have…
      expect(active.background).not.toBe(resting.background);
      // …and a shape, so the state survives a reader who can't see the tint.
      expect(active.tick).toBe("1");
      expect(resting.tick).toBe("0");

      // And what the keys do, said once under the list — the arrows worked
      // before this, but nothing on screen admitted it.
      const keys = page.locator("kbd");
      await expect(keys).toHaveText(["↑↓", "↵", "esc"]);
      await expect(page.getByText("Move")).toBeVisible();
      await expect(page.getByText("Select")).toBeVisible();
      await expect(page.getByText("Close")).toBeVisible();
    });
  }

  test("a typed `/` opens the commands, and the arrows walk those too", async ({
    page,
  }) => {
    await page.goto(url("/coach"));
    await composer(page).click();
    await composer(page).pressSequentially("/");

    const list = page.getByRole("listbox", { name: "Coach commands" });
    await expect(list).toBeVisible();
    expect(await highlighted(page)).toContain("/week");

    await composer(page).press("ArrowDown");
    expect(await highlighted(page)).toContain("/review");

    await composer(page).press("Escape");
    await expect(list).toBeHidden();
    await expect(composer(page)).toHaveValue("/");
  });
});
