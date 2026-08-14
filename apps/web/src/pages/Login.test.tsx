import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { i18n } from "@/i18n";
import { Login } from "./Login";

afterEach(async () => {
  // Vitest runs without globals, so RTL never registered its own auto-cleanup
  // and two renders would otherwise stack in one document.
  cleanup();
  // The i18next instance is global too: a test that switches language has to
  // put it back or it leaks into whatever runs next.
  await i18n.changeLanguage("en");
});

describe("Login page", () => {
  it("offers exactly one call to action", () => {
    render(<Login />);
    // The language picker is a button too, so the assertion is about the
    // *calls to action*: DESIGN.md allows one loud pill per band, and this
    // screen's is Strava.
    const ctas = screen
      .getAllByRole("button")
      .filter((button) => button.textContent?.trim());
    expect(ctas).toHaveLength(1);
    expect(ctas[0].textContent).toBe("Continue with Strava");
  });

  it("signs in in French when French is the language", async () => {
    await i18n.changeLanguage("fr");
    render(<Login />);
    expect(screen.getByText("Continuer avec Strava")).toBeDefined();
    // The headline is two lines around a <br>, so it reads as one accessible
    // name rather than two text nodes.
    expect(
      screen.getByRole("heading", { name: "Chaque course, une histoire." }),
    ).toBeDefined();
  });
});
