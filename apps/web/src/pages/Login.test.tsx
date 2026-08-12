import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Login } from "./Login";

describe("Login page", () => {
  it("shows a single Strava sign-in button", () => {
    render(<Login />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("Continue with Strava");
  });
});
