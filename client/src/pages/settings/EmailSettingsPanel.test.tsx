import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EmailSettingsPanel } from "./EmailSettingsPanel";

vi.mock("../../lib/apiClient", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../../lib/apiClient";

const mockedApiRequest = vi.mocked(apiRequest);

function view(overrides: {
  canEdit: boolean;
  passwordSet: boolean;
  source?: "institution" | "server" | "none";
}) {
  return {
    source: overrides.source ?? "institution",
    serverDefaultAvailable: false,
    canEdit: overrides.canEdit,
    settings: {
      smtpHost: "smtp.college.example",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "mailer",
      mailFrom: "College <no-reply@college.example>",
      passwordSet: overrides.passwordSet,
    },
  };
}

describe("EmailSettingsPanel", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("never shows the stored password — only that one is saved — and lets a System Administrator save, test and revert", async () => {
    mockedApiRequest.mockResolvedValue(view({ canEdit: true, passwordSet: true }));
    renderWithProviders(<EmailSettingsPanel />);

    expect(await screen.findByDisplayValue("smtp.college.example")).toBeInTheDocument();
    expect(screen.getByText(/A password is saved/)).toBeInTheDocument();
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.value).toBe("");
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send test email to me" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use the server's defaults" })).toBeInTheDocument();
    expect(screen.getByText("Using this institution's settings")).toBeInTheDocument();
  });

  it("is read-only for an administrator who cannot change it", async () => {
    mockedApiRequest.mockResolvedValue(view({ canEdit: false, passwordSet: false }));
    renderWithProviders(<EmailSettingsPanel />);

    expect(await screen.findByText(/Only a System Administrator can change/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("smtp.college.example")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send test email to me" })).not.toBeInTheDocument();
  });

  it("says plainly when email is not configured anywhere", async () => {
    mockedApiRequest.mockResolvedValue(view({ canEdit: true, passwordSet: false, source: "none" }));
    renderWithProviders(<EmailSettingsPanel />);

    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send test email to me" })).toBeDisabled();
  });
});
