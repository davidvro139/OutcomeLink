import { prisma } from "./prisma";
import type { XlsxSheet } from "./xlsx";

/** A row of the "Report Info" sheet: `[label, value]`, or a bare `[section]` heading. */
export type ProvenanceEntry = [label: string, value?: string];

export const PROVENANCE_SHEET_NAME = "Report Info";

/**
 * Docs/TODO.md "Report provenance": every export carries a "Report Info"
 * sheet — what was run, for which periods, when, by whom, and how fresh the
 * calculated numbers are — so a file that's been emailed around months later
 * can still be interpreted. A separate sheet rather than a header block on
 * the data sheet, so the data sheet stays a clean table for machines/pivots.
 */
export function buildProvenanceSheet(entries: ProvenanceEntry[]): XlsxSheet {
  return {
    name: PROVENANCE_SHEET_NAME,
    columns: [
      { header: "Item", key: "label", width: 30 },
      { header: "Value", key: "value", width: 90 },
    ],
    rows: entries.map(([label, value]) => ({ label, value: value ?? "" })),
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export interface PeriodProvenance {
  id: number;
  label: string;
  startDate: Date;
  endDate: Date;
}

/**
 * One entry per period: its date range plus when its CPL numbers were last
 * computed. The calculated results (classifications, CPL percentages) are a
 * snapshot from that compute — data edited afterwards isn't reflected until
 * the period is recomputed — so a period that was never computed is called
 * out explicitly rather than silently exporting empty/stale-looking numbers.
 */
export async function describePeriods(periods: PeriodProvenance[]): Promise<ProvenanceEntry[]> {
  if (periods.length === 0) return [["Reporting periods", "None selected"]];

  const latest = await prisma.cplCalculationResult.groupBy({
    by: ["reportingPeriodId"],
    where: { reportingPeriodId: { in: periods.map((p) => p.id) } },
    _max: { computedAt: true },
  });
  const computedAtByPeriod = new Map(latest.map((l) => [l.reportingPeriodId, l._max.computedAt]));

  return periods.map((p, i) => {
    const computedAt = computedAtByPeriod.get(p.id);
    return [
      periods.length > 1 ? `Reporting period ${i + 1}` : "Reporting period",
      `${p.label} (${formatDate(p.startDate)} to ${formatDate(p.endDate)}) — ${
        computedAt ? `CPL results last computed ${formatTimestamp(computedAt)}` : "CPL results not yet computed"
      }`,
    ] as ProvenanceEntry;
  });
}

export async function describeGeneratedBy(userId: number): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? `User #${userId}`;
}
