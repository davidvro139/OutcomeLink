import type { Role } from "@outcomelink/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../auth/AuthContext";
import { renderWithProviders } from "../../test/renderWithProviders";
import { FollowUpsTab } from "./FollowUpsTab";

vi.mock("../../lib/apiClient", () => ({
  apiRequest: vi.fn().mockResolvedValue([]),
}));

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
      <FollowUpsTab studentId={1} />
    </AuthContext.Provider>,
  );
}

describe("FollowUpsTab write controls", () => {
  it("shows Record Attempt to a role the server allows to write", async () => {
    renderAs("CAREER_SERVICES_STAFF");
    expect(await screen.findByText("Follow-up history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record Attempt" })).toBeInTheDocument();
  });

  it("hides Record Attempt from the Read-Only/Auditor", async () => {
    renderAs("READ_ONLY_AUDITOR");
    expect(await screen.findByText("Follow-up history")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record Attempt" })).not.toBeInTheDocument();
  });
});
