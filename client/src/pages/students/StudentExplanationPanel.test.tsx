import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/renderWithProviders";
import { StudentExplanationPanel } from "./StudentExplanationPanel";

vi.mock("../../lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "../../lib/apiClient";

const mockedApiRequest = vi.mocked(apiRequest);

describe("StudentExplanationPanel", () => {
  it("shows a message when nothing has been computed yet for this period", async () => {
    mockedApiRequest.mockResolvedValueOnce({ classifications: [] });

    renderWithProviders(<StudentExplanationPanel reportingPeriodId={1} enrollmentId={1} />);

    expect(await screen.findByText(/not yet computed/i)).toBeInTheDocument();
  });

  it("renders each metric's classification and the classifier's own reasoning text", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      classifications: [
        {
          metric: "COMPLETION",
          classificationCode: "GRADUATE_COMPLETER",
          countsInNumerator: true,
          countsInDenominator: true,
          reasonText: "Earned a credential within this reporting period (COE: Graduate Completer).",
        },
        {
          metric: "PLACEMENT",
          classificationCode: "EMPLOYED_RELATED",
          countsInNumerator: true,
          countsInDenominator: true,
          reasonText: "Employed in a position related to the field of instruction.",
        },
        {
          metric: "LICENSURE",
          classificationCode: "NOT_APPLICABLE",
          countsInNumerator: false,
          countsInDenominator: false,
          reasonText: "Licensure is not required for this program, or the student is not a graduate completer this period.",
        },
      ],
    });

    renderWithProviders(<StudentExplanationPanel reportingPeriodId={1} enrollmentId={1} />);

    await waitFor(() => expect(screen.getByText("GRADUATE_COMPLETER")).toBeInTheDocument());

    expect(screen.getByText("EMPLOYED_RELATED")).toBeInTheDocument();
    expect(screen.getByText(/employed in a position related to the field of instruction/i)).toBeInTheDocument();

    // A NOT_APPLICABLE row still shows up with its own reason — spec §19's
    // "why doesn't this student count" principle, not just a blank cell.
    expect(screen.getByText("NOT_APPLICABLE")).toBeInTheDocument();
    expect(screen.getByText(/not required for this program/i)).toBeInTheDocument();
  });
});
