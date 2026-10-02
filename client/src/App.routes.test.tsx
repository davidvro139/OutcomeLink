import type { Role } from "@outcomelink/shared";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthContext } from "./auth/AuthContext";
import { apiRequest, apiRequestPaginated } from "./lib/apiClient";
import { renderWithProviders } from "./test/renderWithProviders";

vi.mock("./lib/apiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/apiClient")>()),
  apiRequest: vi.fn(),
  apiRequestPaginated: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);
const mockedPaginated = vi.mocked(apiRequestPaginated);

function renderApp(role: Role | null, path: string) {
  return renderWithProviders(
    <AuthContext.Provider
      value={{
        user: role
          ? { id: 1, institutionId: 1, name: "Ada Administrator", email: "ada@mwtc.edu", role }
          : null,
        status: role ? "authenticated" : "unauthenticated",
        sessionEndReason: null,
        login: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("app routes", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
    mockedApiRequest.mockReset();
    mockedPaginated.mockReset();
    mockedPaginated.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
    });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.includes("/api/notifications")) return { notifications: [], unreadCount: 0 };
      if (path.includes("reporting-periods")) return { reportingPeriods: [] };
      if (path.includes("/api/settings/email")) {
        return {
          source: "none",
          serverDefaultAvailable: false,
          canEdit: true,
          settings: {
            smtpHost: "",
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: "",
            mailFrom: "",
            passwordSet: false,
          },
        };
      }
      if (path.includes("/api/dashboard/programs")) {
        return {
          period: null,
          freshness: { computedAt: null, ageDays: null, neverComputed: true, stale: false },
          summary: {},
          programs: [],
          attention: [],
        };
      }
      return {};
    });
  });

  it("shows About before sign-in", async () => {
    renderApp(null, "/about");
    expect(
      await screen.findByRole("heading", { level: 1, name: "About OutcomeLink" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  });

  it("links an administrator to Help, Settings, Job History, and My Programs", async () => {
    renderApp("SYSTEM_ADMINISTRATOR", "/");

    expect(await screen.findByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "My Programs" })).toHaveAttribute("href", "/my-programs");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Job History" })).toHaveAttribute("href", "/jobs");
  });

  it.each([
    ["/help", "Help"],
    ["/settings", "Settings"],
  ])("opens %s", async (path, heading) => {
    renderApp("SYSTEM_ADMINISTRATOR", path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("shows the Settings tabs", async () => {
    renderApp("SYSTEM_ADMINISTRATOR", "/settings");
    expect(await screen.findByRole("tab", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data retention" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Backups" })).toBeInTheDocument();
  });

  it("hides administration links from a program administrator", async () => {
    renderApp("PROGRAM_ADMINISTRATOR", "/");

    expect(await screen.findByRole("link", { name: "My Programs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bulk Import" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Job History" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("tells an instructor who opens Settings by URL that they cannot", async () => {
    renderApp("INSTRUCTOR_STAFF", "/settings");
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Email" })).not.toBeInTheDocument();
  });

  it("tells an instructor who opens Job History by URL that they cannot", async () => {
    renderApp("INSTRUCTOR_STAFF", "/jobs");
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Jobs" })).not.toBeInTheDocument();
  });
});
