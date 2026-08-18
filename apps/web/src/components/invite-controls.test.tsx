import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
// Type-only, so it survives the module mock below.
import type { RunInvite } from "@/api";
import { InviteControls } from "./invite-controls";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<{ invites: RunInvite[] }> => ({ invites: [] })),
  create: vi.fn(),
  revoke: vi.fn(),
  trackEvent: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock("@/api", () => ({
  listRunInvitesOptions: () => ({
    queryKey: ["run-invites", "7"],
    queryFn: mocks.list,
  }),
  listRunInvitesQueryKey: () => ["run-invites", "7"],
  // The film's half of the same fact — invalidated whenever the panel's is.
  getRunPartnerQueryKey: () => ["run-partner", "7"],
  createRunInviteMutation: () => ({ mutationFn: mocks.create }),
  revokeRunInviteMutation: () => ({ mutationFn: mocks.revoke }),
}));

vi.mock("@/lib/logger", () => ({
  trackEvent: mocks.trackEvent,
  trackError: mocks.trackError,
}));

function invite(supported: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderComponent(
    <InviteControls
      activityId={7}
      runName="Morning run"
      supported={supported}
    />,
    { wrapper: Wrapper },
  );
}

afterEach(() => {
  cleanup();
  // Reset rather than clear: a test that queues answers for the list has to
  // hand the empty one back afterwards, and `vi.fn(impl)` restores that impl.
  mocks.list.mockReset();
  mocks.revoke.mockReset();
  mocks.trackEvent.mockClear();
});

describe("invite controls", () => {
  it("asks nobody along on a cut with one lane", async () => {
    // The card and the sheet are both stacks of sections, and this one has
    // nothing to say about a solo film — and the run's invitations are not even
    // fetched, which is the difference between a hidden control and an idle
    // request per run in the list.
    const { container } = invite(false);

    expect(container.innerHTML).toBe("");
    await waitFor(() => expect(mocks.list).not.toHaveBeenCalled());
  });

  it("offers the invitation where there is a lane for it", async () => {
    invite(true);

    const button = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Add who you ran with",
    });
    expect(button.disabled).toBe(false);
    expect(mocks.list).toHaveBeenCalled();
  });

  it("asks again, and says who answered while the athlete was waiting", async () => {
    // The acceptance happens in somebody else's browser, so this one is never
    // told: without the check beside the link, the only way to learn about it
    // is to reload the studio.
    const pending: RunInvite = {
      token: "t",
      activity_id: 7,
      status: "pending",
      invitee_name: null,
      invitee_activity_id: null,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      responded_at: null,
      created_at: new Date().toISOString(),
    };
    mocks.list.mockResolvedValueOnce({ invites: [pending] }).mockResolvedValue({
      invites: [{ ...pending, status: "accepted", invitee_name: "Sam" }],
    });

    invite(true);
    const check = await screen.findByRole("button", {
      name: "Check for an answer",
    });

    fireEvent.click(check);

    expect(await screen.findByText("Sam is in")).toBeTruthy();
    expect(mocks.trackEvent).toHaveBeenCalledWith("ui.invite_checked", {
      activityId: 7,
    });
  });

  it("takes the runner back out, and offers the invitation again", async () => {
    // The whole point of removing somebody is inviting somebody else, so the
    // panel has to come back to the state it started in rather than to an
    // empty card.
    const accepted: RunInvite = {
      token: "t",
      activity_id: 7,
      status: "accepted",
      invitee_name: "Sam",
      invitee_activity_id: 42,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      responded_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    mocks.list
      .mockResolvedValueOnce({ invites: [accepted] })
      .mockResolvedValue({ invites: [{ ...accepted, status: "revoked" }] });
    mocks.revoke.mockResolvedValue({ ...accepted, status: "revoked" });

    invite(true);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Sam" }));

    expect(
      await screen.findByRole("button", { name: "Add who you ran with" }),
    ).toBeTruthy();
    expect(mocks.trackEvent).toHaveBeenCalledWith("ui.invite_partner_removed", {
      activityId: 7,
    });
  });
});
