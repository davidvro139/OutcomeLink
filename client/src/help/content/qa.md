---
title: Questions and answers
slug: qa
group: Q&A
order: 1
reviewed: 2026-09-24
---

## Everyday questions

### Why can't I see the Users, Settings or Bulk Import pages?

Those are for administrators (Bulk Import also for Program Administrators). The menu only shows what your role can use, and typing the address directly shows a message instead. Ask an administrator if you need access. See [Getting started](/help/getting-started) for what each role can do.

### Why is there no "New Student" button?

Adding and editing students is limited to System Administrators, Institutional Administrators and Program Administrators. Career Services staff can add employers instead; Instructors and Auditors can't add either.

### Why do I see only some programs and students?

Program Administrators and Read-Only Auditors are limited to the programs and campuses assigned to them. If you see none, no assignment has been made — ask an administrator to assign them on the Users page.

### How do I find a student?

Use the search box at the top, or the Students page (searchable by first and last name together, for example "Isobel Yost"). Both respect your program scope.

### How do I record that a graduate found a job?

Open the student, go to Employment and add the job, then set their outcome for the reporting period on Enrollments & Outcomes. See [Following up with graduates](/help/follow-up).

### What does "Do not contact" do?

The student is not emailed surveys, is skipped by outreach campaigns, and no follow-up attempt can be logged for them. Turn it on from the student's page; the change is in their audit history.

### Why did my survey email not send?

Check the message shown after sending. It will say if email isn't set up for your institution (you'll get a link to copy instead), if the student is flagged do-not-contact, if they have no email address, or if the mail server refused it. An administrator can see every attempt under Job History → Email log. Running the outreach campaign again re-sends only the failed ones.

## Definitions

### What is a Graduate Completer?

A student who finished the program and earned the credential within the reporting period. Only graduates count toward placement and licensure.

### What does "Awaiting licensure" mean?

A graduate in a program that requires a license who hasn't yet taken, or received the result of, the exam. They are left out of the licensure rate until there is a result, and — while waiting — they are not counted against placement either.

### What is a negotiated benchmark?

A rate the accreditor approved for one program and metric, over a date range, that replaces the standard benchmark. Cards and reports say when one applies.

### What does "At risk" mean? And "Off track"?

**At risk:** below the benchmark but still reachable if the students who can still change the rate succeed. **Off track:** not reachable even in the best case. Both are worked out from the last computed results. See [Program health and benchmarks](/help/program-health).

### What is the outcomes deadline?

The date by which outcome data should be collected, set per reporting period. Dashboards count down to it and at-risk alerts use it.

### What are the reporting period statuses?

Open, Ready for review, Finalized (locked), Submitted, and Reopened (after finalizing, with a recorded reason).

## Numbers that look wrong

### Why is a student not in my placement rate?

Open the CPL Dashboard, click the placement percentage and look at the student in the drill-down: each student shows why they count, or don't. Common reasons: they didn't complete in this reporting period, they're recorded as unavailable or declined to share, they're awaiting a license result, or their enrollment is marked not reportable for accreditation.

### Why do my numbers look out of date?

Rates come from the last **computed** results, not live data. If student data changed since, use Compute on the reporting period (administrators) or Recompute now on My Programs. The Close-out tab tells you how many changes have happened since the last compute.

### Why did Recompute now say to try again shortly?

To protect the server, a period can't be recomputed within five minutes of the last compute. Wait and try again.

### Why did Finalize ask for a reason?

Something is still blocking a clean close-out — open validation errors, results or validation that are out of date, or an off-track program with no improvement plan. An administrator can finalize anyway with a recorded reason. See [Closing a reporting period](/help/closeout).

### Why does Finalize say I need to sign off?

Finalizing requires an administrator's sign-off on the current results, and a sign-off goes out of date if results are recomputed or student data changes afterwards. Sign off again from the Close-out tab.

### Why is a download "expired"?

Generated report and export files are deleted after the retention period an administrator set in Settings (30 days by default). Run the report or export again.

## Importing and data problems

### Why did rows fail my import?

Each failed row is listed with its reason — a missing required value, an ID that already exists, a duplicate within the file, or an unknown program code. Fix the file and import again; rows that already imported are recognized and skipped.

### Why can't I undo an import?

An import commits only valid rows and can't be reversed as a whole. Correct individual records from the student page. Everything the import created is in the audit history.

## Security and privacy

### Is my data safe?

The [Security and privacy](/help/security) page says exactly what protects it — role and program scoping, sign-in protections, the audit history and encrypted secrets — and what it does not do, such as multi-factor sign-in.

### Who can see that I changed something?

Every change by a signed-in person is recorded with who and when, on the record's Audit History tab. Viewing a record is not logged.

### Can I sign in with my college account?

Not yet. Sign-in is by email and password; there is no single sign-on.

## Accessibility

### Can I use OutcomeLink with a keyboard or a screen reader?

It is built to meet WCAG 2.1 Level AA and is checked automatically on every main screen. Press Tab once on any page to reach a "Skip to main content" link, use the arrow keys within menus and tabs, and Escape to close a dialog. Automated checks find only part of what a person would, and it has not been formally tested with screen readers — please report anything that doesn't work to your administrator.

### Is there a light theme?

No — the application uses a dark theme throughout, chosen and checked for readable contrast.
