import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/renderWithProviders";
import { NotificationBell } from "./NotificationBell";

vi.mock("../lib/apiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/apiClient")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../lib/apiClient";

const mockedApiRequest = vi.mocked(apiRequest);

const note = (id: number, patch: Record<string, unknown> = {}) => ({
  id,
  userId: 1,
  type: "VALIDATION_ERROR",
  message: `Message ${id}`,
  referenceEntityType: null,
  referenceEntityId: null,
  createdAt: "2026-09-24T12:00:00Z",
  readAt: null,
  ...patch,
});

describe("NotificationBell", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockImplementation(async (path: string) =>
      path.startsWith("/api/notifications") && !path.includes("read")
        ? { notifications: [note(1), note(2, { readAt: "2026-09-24T13:00:00Z" })], unreadCount: 1 }
        : {},
    );
  });

  // The popover's contents (dialog role, Mark read / Download buttons) are checked in a real browser by
  // cypress/e2e/accessibility.cy.ts — Mantine's ScrollArea and popover transitions are too slow to exercise in jsdom.
  it("tells a screen reader how many notifications are unread, in the button's own name", async () => {
    renderWithProviders(<NotificationBell />);
    expect(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeInTheDocument();
  });
});
