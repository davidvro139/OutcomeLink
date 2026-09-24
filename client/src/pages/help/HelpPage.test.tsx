import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/renderWithProviders";
import { AboutPage } from "./AboutPage";
import { HelpPage } from "./HelpPage";

function renderHelp(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/help" element={<HelpPage />} />
        <Route path="/help/:slug" element={<HelpPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  window.scrollTo = vi.fn();
});

describe("HelpPage", () => {
  it("opens About by default, with its review date and a topic list", () => {
    renderHelp("/help");
    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "About OutcomeLink" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last reviewed/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Help topics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About OutcomeLink" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the topic named in the address", () => {
    renderHelp("/help/security");
    expect(screen.getByRole("heading", { level: 2, name: /security/i })).toBeInTheDocument();
  });

  it("says so when the topic doesn't exist", () => {
    renderHelp("/help/nope");
    expect(screen.getByText("That help topic doesn't exist")).toBeInTheDocument();
  });

  it("searches, announces the result count, and links to the matching section", async () => {
    renderHelp("/help");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search the help" }), "finalize");
    expect(screen.getByRole("status")).toHaveTextContent(/\d+ results? for “finalize”/);
    const links = within(screen.getByRole("list", { name: "Search results" })).getAllByRole("link");
    expect(links[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/help\/[a-z-]+(#[a-z0-9-]+)?$/),
    );
  });

  it("says when nothing matches", async () => {
    renderHelp("/help");
    await userEvent.type(screen.getByRole("searchbox"), "zzzzunmatchable");
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 results");
  });
});

describe("AboutPage", () => {
  it("shows only the public documents, with no signed-in user", () => {
    renderWithProviders(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "About OutcomeLink" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/Closing a reporting period/)).not.toBeInTheDocument();
  });
});
