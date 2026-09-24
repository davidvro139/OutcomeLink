import type { Role } from "@outcomelink/shared";
import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../auth/AuthContext";
import { renderWithProviders } from "../../test/renderWithProviders";
import { CloseoutTab } from "./CloseoutTab";

vi.mock("../../lib/apiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/apiClient")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../lib/apiClient";

const mockedApiRequest = vi.mocked(apiRequest);

const step = (
  id: string,
  title: string,
  state: string,
  detail: string,
  action: string | null = null,
) => ({
  id,
  title,
  state,
  detail,
  action,
  link: null,
});

const closeout = (patch: Record<string, unknown> = {}) => ({
  locked: false,
  status: "OPEN",
  blockers: [],
  signOffCurrent: true,
  canFinalize: true,
  needsOverride: false,
  signOff: null,
  finalizeOverrideReason: null,
  steps: [
    step("compute", "Compute results", "DONE", "Computed just now."),
    step("signoff", "Sign off the review", "DONE", "Signed off by Ada."),
    step("finalize", "Finalize the period", "TODO", "Everything is in order.", "FINALIZE"),
  ],
  ...patch,
});

function renderAs(role: Role) {
  return renderWithProviders(
    <AuthContext.Provider
      value={{
        user: { id: 1, institutionId: 1, name: "Test", email: "t@example.com", role },
        status: "authenticated",
        sessionEndReason: null,
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter>
        <CloseoutTab reportingPeriodId={7} onOpenTab={vi.fn()} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("CloseoutTab", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("shows each step with its state, and a plain finalize when nothing blocks", async () => {
    mockedApiRequest.mockResolvedValue(closeout());
    renderAs("INSTITUTIONAL_ADMINISTRATOR");

    expect(await screen.findByText("Nothing is blocking finalize")).toBeInTheDocument();
    expect(screen.getByLabelText("Compute results: Done")).toBeInTheDocument();
    expect(screen.getByLabelText("Finalize the period: To do")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Finalize…" }));
    const confirm = await screen.findByRole("button", { name: "Finalize" });
    expect(confirm).toBeEnabled();
    expect(screen.queryByLabelText(/Override reason/)).not.toBeInTheDocument();
  });

  it("lists the blockers and will not finalize until an override reason is given", async () => {
    mockedApiRequest.mockResolvedValue(
      closeout({
        needsOverride: true,
        blockers: [{ code: "OPEN_ERRORS", message: "3 open validation errors must be resolved." }],
      }),
    );
    renderAs("INSTITUTIONAL_ADMINISTRATOR");

    expect(await screen.findByText("1 thing blocking a clean finalize")).toBeInTheDocument();
    expect(screen.getAllByText(/3 open validation errors/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Finalize…" }));
    const confirm = await screen.findByRole("button", { name: "Finalize anyway" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Override reason/), {
      target: { value: "COE approved an exception" },
    });
    expect(screen.getByRole("button", { name: "Finalize anyway" })).toBeEnabled();
  });

  it("shows the record on a finalized period, including an override reason", async () => {
    mockedApiRequest.mockResolvedValue(
      closeout({
        locked: true,
        status: "FINALIZED",
        signOff: { at: "2026-09-10T12:00:00Z", by: "Ada", note: "Reviewed" },
        finalizeOverrideReason: "COE approved an exception",
        steps: [step("finalize", "Finalize the period", "LOCKED", "Finalized.")],
      }),
    );
    renderAs("INSTITUTIONAL_ADMINISTRATOR");

    expect(await screen.findByText("This period is finalized")).toBeInTheDocument();
    expect(screen.getByText(/COE approved an exception/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize…" })).not.toBeInTheDocument();
  });

  it("is read-only for roles that can't finalize: the steps show but no action buttons", async () => {
    mockedApiRequest.mockResolvedValue(closeout());
    renderAs("PROGRAM_ADMINISTRATOR");

    expect(await screen.findByLabelText("Compute results: Done")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize…" })).not.toBeInTheDocument();
  });
});
