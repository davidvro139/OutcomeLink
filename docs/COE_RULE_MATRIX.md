# COE CPL Rule Matrix

Documented per spec §67, before any classification/calculation logic is implemented. Every rule below is sourced to an official Council on Occupational Education (COE) publication — nothing here is inferred or guessed. Where the source documents don't settle a question, it's listed explicitly under "Open questions" rather than assumed.

## Sources

1. **Annual Report Help Manual, Revised October 2025** (current edition at time of writing) — `https://council.org/wp-content/uploads/2024/11/Annual-Help-Manual-Revised-October-2025.pdf`, linked from `https://council.org/handbooks/`. Retrieved 2026-09-14.
2. **Annual Report Help Manual, 2024 edition** (due date March 15, 2025) — `https://council.org/wp-content/uploads/2024/11/2024-AR-Help-Manual-V1_11_11_24-.pdf`. Retrieved 2026-09-14. Used only for the row-by-row CPL worksheet definitions (Rows 1–26): that section rendered as a non-extractable image/table in the October 2025 PDF, but every passage that *is* extractable in both editions (the Allowable Subtraction categories, the benchmark percentages) is verbatim identical between them, so there's no indication the underlying definitions changed — only administrative details did (see below).
3. **COE Handbook of Accreditation** (2025 edition, effective for the current cycle) — `https://council.org/wp-content/uploads/2024/12/2025-HB-Generic-Handbook-12-15-24-1.pdf` — referenced but not yet deep-read; flagged under "Not yet reviewed."

A confirmed change between the two Annual Report Help Manual editions: the Commission's annual action-on-reports meeting moved from **June** (2024 edition) to **March** (October 2025 edition). This is the kind of detail that would be silently wrong if the 2024 edition were used as the sole source — hence pinning everything to the current edition and only falling back to the older one for content that is unambiguously unchanged.

## 1. Reporting period

- Institution-selected, consecutive **12-month period**, starting no earlier than **April 1** and ending no later than **June 30**.
- **One reporting period must be used for all programs** at the institution — periods cannot vary by program.
- A change to a previously-used reporting period requires a written request to the Council (on letterhead) explaining the circumstances, before the new period is used.
- → **OutcomeLink**: `ReportingPeriod.startDate`/`endDate` must be validated as a single institution-wide 12-month span; there is no per-program override. `cohortWindowDefinition` (docs/DATA_MODEL.md §16) should encode "start ≤ actual_completion_date ≤ end" as the base rule, not a per-program window.

## 2. Enrollment

| Row | COE definition |
|---|---|
| Beginning Enrollment | Students enrolled in the program on the first day of the reporting period — equal to "Still Enrolled" reported at the end of the prior reporting period, net of allowable subtractions. |
| New Enrollees | New, unduplicated enrollments during the reporting period, net of allowable subtractions. |
| Cumulative Enrollment | Beginning Enrollment + New Enrollees. |
| Still Enrolled | Students enrolled in the program on the last day of the reporting period, continuing into the next period. |

**Allowable Subtraction categories** (may be subtracted from Beginning Enrollment or New Enrollees before either number is reported; each subtraction must have supporting documentation in the student's file):

- **A.** Transferred to another program within the institution.
- **B.** Received a 100% tuition refund after withdrawal, or attended only the first day of class.
- **C.** Documented unavailability to earn a credential: pregnancy, other serious health issues (physical/mental/behavioral), caring for ill family members, incarceration, death, etc.
- **D.** Left to serve with a federal foreign-aid service (e.g., Peace Corps), an official church mission, or due to military/national-guard duty activation or relocation (including spouses of enlisted personnel who are relocating for that reason).
- **E.** Secondary students (reported on a separate secondary-program form instead).

→ **OutcomeLink**: these are exclusions from the **enrollment count itself**, not from completion/placement — a subtracted student never enters the cumulative-enrollment denominator at all. This needs to be a distinct concept from the placement-specific exclusions in §4 below. Model as a `classification_code` value (or a dedicated exclusion-reason field) on `StudentClassification`/`StudentEnrollment` distinguishing "excluded from enrollment count" from "counted but excluded from placement denominator."

→ **Implemented** (docs/TODO.md §9, cross-checked against an institution's own outcomes-training material, `docs/Outcomes and CPL slides.pdf`, which independently confirmed these categories function as *Completion*-rate exclusions in practice — not just enrollment-count ones — since a subtracted student's cumulative-enrollment reduction flows through to the Completion Rate's denominator too, per §3's formula below): `StudentEnrollment.allowableSubtractionReason` (`AllowableSubtractionReason` enum: `FULL_REFUND_OR_FIRST_DAY_ONLY` / `DOCUMENTED_UNAVAILABLE` / `MISSION_FOREIGN_AID_OR_MILITARY_ACTIVATION`), meaningful only when `enrollmentStatus` is `WITHDRAWN`. Category **A** (transferred internally) is deliberately not a separate reason value — it's already handled for free by the existing `TRANSFERRED` enrollment status, which never enters completion classification at all. Category **E** (secondary students) is handled by the separate `reportableForAccreditation` mechanism below, not this enum, since it applies regardless of how/whether the student ever exits. The classifier (`coe2026.ts`) checks `allowableSubtractionReason` before the ordinary `WITHDRAWN` branch and returns a new `ALLOWABLE_SUBTRACTION` completion classification — counted in neither numerator nor denominator — instead of the negative `WITHDRAWAL`.

**Enrollment Objective scoping — resolved 2026-09-16.** `docs/Outcomes and CPL slides.pdf` separately raised a question this document's own official sources couldn't settle by text-extraction (they're scanned-image PDFs — see the now-superseded note previously in `docs/TODO.md` §9): does a student's declared "enrollment objective" gate whether their enrollment is in scope for the Annual Report at all? Confirmed directly by someone with institutional COE experience: **yes**, and there's a third category beyond the two the slide deck named — **Secondary** (dual-enrolled high-school students), which is excluded the same way. Critically, the confirmation was also explicit that "Certificate Seeker" / "Occupational Upgrade" / "Secondary" are **that institution's own SIS (Northstar) vocabulary for a real COE-relevant distinction, not COE-mandated terminology** — different institutions' systems may label the same underlying concept differently. → **Implemented**: `StudentEnrollment.enrollmentObjective` (free-text, institution-defined label — not a shared controlled vocabulary, since COE doesn't dictate the exact category names) alongside `StudentEnrollment.reportableForAccreditation` (`Boolean`, `@default(true)`) as the actual gate the classifier respects — this two-field split (a descriptive label plus a boolean the engine actually checks) deliberately avoids building a per-institution "objective → reportable" configuration screen before anything needs one; an institution that wants Secondary/Personal-Enrichment enrollments in scope for its own internal tracking can still record them, just with the box checked. The classifier checks this before every other Completion rule and returns a new `NOT_REPORTABLE` classification (counted in neither numerator nor denominator) — which, like `ALLOWABLE_SUBTRACTION`, flows through automatically to make Placement and Licensure `NOT_APPLICABLE` too, since both already gate on Completion's result.

## 3. Completion

- **Completers** = Non-Graduate Completers + Graduate Completers.
  - **Graduate Completer**: demonstrated the competencies required for the program (or an exit point within it) and was awarded the credential (certificate/diploma/degree).
  - **Non-Graduate Completer**: left before graduating but acquired sufficient competencies for employment in the field (or a related field), **as evidenced by that employment**. (A non-graduate completer is, by this definition, always employed-related — there's no such thing as a non-graduate completer who isn't employed.)
  - **Withdrawal**: left without earning a credential *and* without securing related employment. Withdrawals are not completers and are not an allowable subtraction — they count against the institution, **unless** the withdrawal itself falls into one of §2's Allowable Subtraction categories (C or D), in which case it's excluded from this rate entirely instead — see the implementation note under §2.
- **Completion Rate** = Total Completers ÷ (Cumulative Enrollment − Still Enrolled) × 100.
- Secondary-program completion uses a simpler single form (Enrollment, Still Enrolled, Completers, Withdrawals) with the same rate formula; secondary completers include the same "credential OR credit toward graduation OR competencies evidenced by employment" definition.

→ **Implemented**: `StudentClassification.classificationCode` for the `COMPLETION` metric is one of `GRADUATE_COMPLETER` / `NON_GRADUATE_COMPLETER` / `WITHDRAWAL` / `ALLOWABLE_SUBTRACTION` (the §2 exclusion, both numerator and denominator false) / `NOT_REPORTABLE` (the enrollment-objective exclusion, checked first — see §2's "Enrollment Objective scoping" note) / `NOT_APPLICABLE` (not concluded this period at all).

## 4. Placement

This is the metric most prone to being guessed wrong, so it gets the most detail. COE breaks every Graduate Completer into exactly one of six categories, which together reconstruct the total:

| Category | Definition | In placement numerator? | In placement denominator? |
|---|---|---|---|
| Employed, related | Employed in the field of instruction, **OR entered the military, OR is continuing their education** | **Yes** | Yes |
| Employed, unrelated | Employed in a field unrelated to the field of instruction | No | Yes |
| Awaiting licensure | Completed the program and is waiting to sit a required licensure exam, or sat it and is awaiting pass/fail results — *unless already employed related, in which case they're counted there instead* | No | **Excluded entirely** |
| Unavailable for employment | Documented: pregnancy, other serious health issues, caring for ill family members, incarceration, death, etc. | No | **Excluded entirely** |
| Refused employment | Documented: missed interviews, enrolled purely for personal use, or refused an employment offer in the field | No | **Excluded entirely** |
| Seeking / status unknown | Currently seeking related employment, **or cannot be traced for follow-up** | No | Yes (counts against the institution) |

The critical, easy-to-get-wrong rule: **military service and continuing education both count as "related placement" — they are not exclusions.** (An earlier draft of `docs/DATA_MODEL.md` §13 used "a student in continuing education is excluded from the placement denominator" as an illustrative example of why per-metric classification matters — that example was **hypothetical, not a COE rule**, and is factually wrong per this source. It has been corrected there; the underlying data-model decision — metric-scoped `StudentClassification` — is still correct, just needed a true example.)

- **Placement Rate** = (Employed-related count) ÷ (Employed-related + Employed-unrelated + Seeking/unknown) × 100. In worksheet terms: numerator/denominator both exclude Awaiting-licensure, Unavailable, and Refused categories entirely; the denominator does **not** exclude Seeking/unknown.
- A "Total Placement Rate" variant additionally includes Non-Graduate Completers (who are always employed-related by definition) in both numerator and denominator alongside the Graduate figures; a "Graduate Placement Rate" variant uses Graduate Completers only.

→ **OutcomeLink**: `StudentClassification.classificationCode` for the `PLACEMENT` metric should be one of `EMPLOYED_RELATED` (covers direct related employment, military entry, and continuing education — these are **not** separate codes for calculation purposes, though it may be worth preserving *which* of the three applied as a sub-detail for the explanation panel, since "How This Student Counts" should say *why*, e.g. "counts as related placement: continuing education" rather than just "counts"), `EMPLOYED_UNRELATED`, `SEEKING_OR_UNKNOWN`, `AWAITING_LICENSURE` (excluded), `UNAVAILABLE` (excluded), `REFUSED` (excluded). The `CplCalculationExplanation.reasonText` generator must be able to state which of these applied and why — this is exactly the traceability spec §19-20 demand.

→ **Implemented** (docs/TODO.md §9): `StudentOutcomeRecord.relatedToTrainingSource` (`RelatedToTrainingSource`: `STUDENT_REPORTED` / `INSTRUCTOR_REPORTED`) captures who determined `relatedToTraining`, per an institution's own outcomes-training material (`docs/Outcomes and CPL slides.pdf`): a student's own claim about relatedness carries different evidentiary weight than an instructor's expert determination. Provenance only — it does not affect classification.

## 5. Licensure

- Only applies to programs where a licensure exam is required to work in the field (distinct from optional "certification," which the Council does not treat as licensure for this purpose).
- **Licensure Exam Pass Rate** = (Number who passed) ÷ (Number who took the exam and received a result) × 100.
- Graduates still awaiting an exam date, or awaiting results, are excluded from this calculation entirely (they're also excluded from the placement calculation while in this state, per §4).

→ **OutcomeLink**: `StudentClassification.classificationCode` for the `LICENSURE` metric: `PASSED`, `FAILED`, `AWAITING` (excluded from this metric's numerator/denominator, same population as the placement exclusion above — worth double-checking these two exclusions are driven from the same underlying licensure-status field rather than duplicated/divergent state).

## 6. Benchmarks and non-compliance

- Minimum required percentages, applied as the institution's **average across all programs**, and also applied **per program** regardless of length, enrollment, or credential type:
  - Completion: **60%**
  - Placement: **70%**
  - Licensure Exam Pass Rate: **70%**
- Non-compliance progression for the institution-wide average: Year 1 → Notice of Apparent Deficiency; Year 2 → Warning; Year 3 → Probation. (Additional Commission actions possible at any point: workshop attendance, staff consultation, focused review visit.)
- The Commission acts on Annual Report data at its **March** meeting each year (per the current edition — this was June in the 2024 edition, confirming it does change and must be re-verified against whichever edition is current when this matters operationally).

→ **OutcomeLink**: `RuleSet` benchmark configuration should store per-metric percentages (currently 60/70/70) as data, not constants, since the Council could change them in a future edition — exactly the versioned-rules design already committed to in spec §17/18 and `docs/DATA_MODEL.md`.

## 7. Negotiated alternate rates

- **Special populations** (may negotiate alternate completion/placement/licensure rates): (a) students incarcerated in a state or federal prison during instruction; (b) students with physical or mental limitations inhibiting completion or placement.
- **Special programs**: court reporting only, defined solely by its typically-low completion rates. Court reporting programs are still expected to meet the *standard* 70% placement and 70% licensure benchmarks — only the completion benchmark is negotiable for them.
- Negotiation is a formal request (letter to the Council president) approved only by the Commission, per program.

→ **OutcomeLink**: `RuleSet`/`Program` needs a way to record an approved negotiated benchmark override per program per metric, distinct from the standard benchmark, with evidence of Commission approval — this is a Phase 2/Improvement-Plans-adjacent concern (spec §26), not core CPL calculation, but the benchmark comparison logic (§21 Calculation Drill-Down, §37 Data Quality) must check for an override before flagging a program as below-benchmark.

## 8. Scope notes

- **Vocational ESL programs** are in-scope for CPL reporting like any other program, provided they meet the Council's specific ESL-program criteria (job-skills already possessed, admission limited to those needing English instruction to use those skills, placement assistance obligation).
- **Avocational ("stand-alone") ESL programs** are entirely out of the Council's accreditation scope — not on the approved-programs list, not Title IV eligible, not CPL-reportable.
- **Secondary programs** use a separate, simpler completion-only form and are only in scope if the institution has explicitly elected to have COE evaluate its secondary offerings.

→ **OutcomeLink**: `Program` needs a flag distinguishing postsecondary (full CPL) from secondary (completion-only) reporting scope, and ideally one for Vocational-ESL-with-COE-criteria vs. non-reportable avocational offerings, so the accreditation engine doesn't attempt to compute placement/licensure for a program type where COE doesn't require it.

## 9. Open questions (not resolved by these two documents — do not guess)

1. **Exact "related field" determination method.** The documents establish *that* a graduate must be employed "in the field of instruction pursued" to count as related, but the institution-level judgment process for determining relatedness (documentation standards, who signs off) lives in the Handbook of Accreditation or program-specific guidance, not the Annual Report Help Manual. `docs/DATA_MODEL.md`'s `EmploymentRecord.relationshipDeterminationMethod` field anticipates this but its controlled values aren't sourced yet.
2. **Full Handbook of Accreditation review.** Only the Annual Report Help Manual has been read in depth. The Handbook (source 3 above) likely contains the Standard 4 strategic-planning tie-in mentioned here, validation/documentation requirements referenced during accreditation visits, and possibly more precise definitions that supersede or refine anything above. Should be read before the Validation Engine (spec §22) or Improvement Plans (spec §26) are implemented in detail.
3. **Whether COE has published a distinct CPL definitions document** separate from the Annual Report Help Manual (a page fetch of the handbooks index didn't surface one) — worth a direct inquiry to COE if anything here needs a second, authoritative confirmation before going live with real accreditation reporting (this project uses synthetic data only, per spec §6/§52/§56, so the practical risk is low, but the traceability principle still calls for confirming with the Council directly for anything beyond a portfolio deployment).
4. **FTE calculation** (900 clock hours / 45 quarter credit hours / 30 semester credit hours = 1 FTE) was captured because it's in the same manual, but it's a dues/reporting-scale concept, not part of CPL calculation — noted here so it isn't mistakenly folded into the rule engine later.
