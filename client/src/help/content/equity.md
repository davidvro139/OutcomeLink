---
title: Cohort and equity breakdowns
slug: equity
group: Guides
order: 4
reviewed: 2026-09-24
---

## What it is

The Cohort & Equity Breakdown tool disaggregates your Completion, Placement, and Licensure rates by entry year and by demographic groups — so you can see whether an overall program rate hides a gap in outcomes for a particular cohort or demographic group.

## Why it matters

Accreditors and state agencies increasingly ask for outcomes broken down by demographic group. More importantly, a program's overall placement rate of 85% might mask underperformance for one group at 60% and overperformance in another at 95% — disaggregation reveals where support or intervention might be most needed.

## Using the breakdown page

Go to **Accreditation → Cohort & Equity** to open the breakdown tool.

### Selectors

- **Metric** — choose Completion, Placement, or Licensure.
- **Disaggregate by** — choose Entry year, Gender, Race/Ethnicity, Economically disadvantaged, First-generation student, or Disability status.
- **Program** — optionally select a single program to compare against its benchmark. Leave as "All accessible programs" to see institution-wide data without a benchmark.

### The results

**Current Period Results** table shows:
- **Group** — the value of the dimension (e.g. a year, gender, or "Not on file" for students with no demographic field recorded).
- **Denominator** — the count of students in that group.
- **Numerator** — how many counted as successful (or "Suppressed" if fewer than 10 students).
- **Percentage** — their success rate (or "Suppressed" if below the threshold).
- **Status** — Meeting Benchmark, Below Benchmark, Suppressed, or No Data.

**Trend over periods** shows how each group's rate changed across your recent reporting periods (one line per group). When a single program is selected, a benchmark line appears.

## Small-cell suppression

To avoid re-identifying individuals, groups with fewer than 10 students have their numerator and percentage suppressed — the group still appears, but the count and rate are hidden. The group's denominator (total count) is shown, so you can see which groups are small.

## Coverage

When disaggregating by a demographic field, the top of the page notes what percentage of students have that field on file — "285 of 340 students have Gender recorded" means 55 students have no gender field in the system. "Not on file" groups are included in the results to make that coverage transparent.

## Export to Excel

The **Export to Excel** button downloads a workbook with:
- **Groups** sheet: the current-period table.
- **Trend** sheet: rates across periods.
- **Report Info** sheet: when the breakdown was run, what suppression threshold was used, and an explanation of the method.

## When demographic fields are incomplete

Demographic data is optional: not every SIS export includes it. If a field is rarely recorded, the "Not on file" group may be large. You can add or update demographics for individual students on their **Demographics** tab (requires Student Manager role or higher).

## Known limits

- Demographics are not required — many students may have no data on file.
- Entering demographics is done manually per student or via bulk import (optional columns).
- Demographic fields are collected from your SIS or entered by hand; they are not validated against external data.
- Benchmarks apply at the program level, not per demographic group.
