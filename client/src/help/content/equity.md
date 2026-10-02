---
title: Cohort and equity breakdowns
slug: equity
group: Guides
order: 4
reviewed: 2026-10-01
---

## What it is

The Cohort & Equity Breakdown tool disaggregates your Completion, Placement, and Licensure rates by entry year and by demographic groups — so you can see whether an overall program rate hides a gap in outcomes for a particular cohort or demographic group.

**Example**: Your institution reports 75% completion overall, but disaggregated data shows:
- 85% for students entering in Fall 2023
- 65% for students entering in Fall 2022
- 92% for male students, 68% for female students

These breakdowns reveal patterns and gaps that the overall rate masks.

## Why it matters

Accreditors and state agencies increasingly ask for outcomes broken down by demographic group. More importantly, a program's overall placement rate of 85% might mask underperformance for one group at 60% and overperformance in another at 95% — disaggregation reveals where support or intervention might be most needed.

Your institution can then:
- Target support to underperforming groups
- Demonstrate equity awareness in accreditation reviews
- Track progress toward closing gaps over time

## Core concepts

### Dimensions

A dimension is how you split the data:

- **Entry Year** — based on enrollment start date (e.g., 2023, 2024)
- **Gender** — Male, Female, Nonbinary, Prefer Not to Say, or Not on File
- **Race/Ethnicity** — IPEDS categories (White, Black/African American, Hispanic/Latino, Asian, Native Hawaiian/Pacific Islander, American Indian/Alaska Native, Two or More Races, Nonresident Alien, Unknown or Not Reported), or Not on File when the field was never recorded
- **Economically Disadvantaged** — Yes, No, or Not on File
- **First-Generation Student** — Yes, No, or Not on File
- **Disability Status** — Yes, No, or Not on File

### Metrics

Metrics are the outcomes measured:

- **Completion** — Graduated or completed the program
- **Placement** — Employed in a related field (at last check)
- **Licensure** — Passed licensure exam (if required)

For each group, you see:
- **Denominator** — How many students are in this group
- **Numerator** — How many achieved the outcome
- **Percentage** — Numerator ÷ Denominator

Example: 10 female students enrolled; 8 passed licensure → 80% (8 ÷ 10).

### Suppression (Privacy Protection)

Groups with **fewer than 10 students have their numerator and percentage hidden** to protect privacy. You can't infer individual outcomes from tiny groups.

- The **denominator remains visible** so you see the group exists and is small
- **"Not on file" is suppressed the same way** when fewer than 10 students are in it. It is not exempt.

Why 10? It's a standard threshold in higher-education reporting to balance privacy and transparency.

### Coverage definition

When disaggregating by a demographic field, you see **coverage**: what percentage of students have that data on file.

Example: "285 of 340 students have Gender recorded" = 55 students have no gender field. The "Not on File" bucket includes those 55, so your report is fully transparent about data gaps.

## Using the breakdown page

Go to **Cohort & Equity** in the left nav (under Accreditation) to open the breakdown tool.

### Selectors

- **Metric** — choose Completion, Placement, or Licensure.
- **Disaggregate by** — choose Entry year, Gender, Race/Ethnicity, Economically disadvantaged, First-generation student, or Disability status.
- **Program** — optionally select a single program to compare against its benchmark. Leave as "All accessible programs" to see institution-wide data without a benchmark.

### The results

**Current Period Results** table shows:
- **Group** — a plain-language name: a year such as 2024, Male, Female, Yes, No, or "Not on file" when that field was never recorded.
- **Denominator** — the count of students in that group.
- **Numerator** — how many counted as successful, or "Suppressed" when fewer than 10 students are in the group.
- **Percentage** — their success rate, written with a percent sign, or "Suppressed (n<10)" with no percent sign when the group is below the threshold. An empty group shows "N/A".
- **Status** — Meeting benchmark, Below benchmark, Suppressed, or No data. Meeting and Below benchmark appear when one program is selected, so there is a benchmark to compare with.

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

## Recording demographic data

Demographics are used to disaggregate outcomes. You can enter them in two places:

### On the Student Detail Page

1. Navigate to **Students** and open a student's profile
2. Click the **Demographics** tab
3. For each field, select a value or **"Not on file"**
4. Click **Save**

Data is saved immediately and affects breakdowns on the next view.

### During Bulk Import

1. In **Bulk Import**, map columns for demographic fields
2. The importer uses **lenient matching**: "F", "female", and "FEMALE" all map to "Female"
3. Unrecognized values are silently dropped; the student is still imported
4. This design prevents bad data from blocking your import

## Understanding the data

### "Not on File" Means "We Don't Know"

"Not on file" could mean:
- The student chose not to disclose
- You never asked
- The data is in a system you haven't migrated yet

It's not the same as "No" — a tri-state design that preserves this distinction.

### Summing Across Groups

Be careful when summing. If you see 100 total denominator, 70 Female, 20 Male, 10 Not on File — that's 100 total. The 10 "Not on File" students are already counted in the 100, not extra.

### Program Scope

- **Single program**: The breakdown shows only students in that program. The benchmark is that program's target.
- **All programs**: All students are included. No benchmark is shown (different programs have different targets).

### Historical Data

The breakdown reads the last **computed** classifications and groups them with the demographics on file now, so a demographic edit shows up the next time you open the page. Who counts in the rate changes when results are computed again, not when validation is re-run.

## Common workflows

### Spot a Gap

1. Run Completion by Gender
2. Notice Female students are at 60%, Male at 85%
3. Click **Export to Excel** to share with leadership
4. Use the Report Info sheet to explain suppression thresholds

### Track Progress Over Time

1. Run Placement rate by Entry Year
2. Check the trend chart — are older cohorts climbing toward the benchmark?
3. Compare 2023 vs. 2022 vs. 2021 to spot patterns

### Audit Data Quality

1. Run any breakdown and look at Coverage
2. If coverage is below 70%, schedule a data review
3. Use Bulk Import to backfill demographics for past students

### Prepare for Accreditation

1. Run all three metrics (Completion, Placement, Licensure) by the demographic categories your accreditor asks about
2. Export each to Excel
3. Share the Report Info sheet — it documents your methodology for reviewers

## When demographic fields are incomplete

Demographic data is optional: not every SIS export includes it. If a field is rarely recorded, the "Not on file" group may be large. System Administrators, Institutional Administrators and Program Administrators can add or update demographics on a student's **Demographics** tab.

## Known limits

- Demographics are not required — many students may have no data on file.
- Entering demographics is done manually per student or via bulk import (optional columns).
- Demographic fields are collected from your SIS or entered by hand; they are not validated against external data.
- Benchmarks apply at the program level, not per demographic group.
- No drill-down to students — the breakdown is aggregate only.
- A suppressed group has no rate for that period on the trend. The period itself still appears.
- Coverage is only shown for demographic dimensions — all students have an entry year.
