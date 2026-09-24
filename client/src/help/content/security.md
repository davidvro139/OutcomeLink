---
title: Security and privacy
slug: security
group: Security
order: 1
reviewed: 2026-09-24
public: true
---

This page describes what OutcomeLink does to protect student and institutional data, and — just as important — what it does **not** do. It is written from how the application actually behaves and is reviewed whenever security-relevant behavior changes. The date above says when it was last checked.

## Who can see and change what

- **Roles.** Every account has one of six roles: System Administrator, Institutional Administrator, Program Administrator, Career Services Staff, Instructor/Staff, and Read-Only Auditor. The server enforces the role on every request; controls a role can't use are hidden in the screens, but hiding is a convenience — the server refuses the request either way.
- **Program and campus scoping.** Program Administrators and Read-Only Auditors see only the programs (and campuses) they have been assigned. A scoped person with no assignments sees nothing. Students, enrollments, follow-ups, reports, dashboards and exports all apply the same limit.
- **Institution separation.** Every record belongs to one institution and every query is limited to the signed-in person's institution. Another institution's data is not merely hidden — asking for it returns "not found". This is covered by automated tests.
- **Who may change what.** Adding or editing students and imports needs an administrator or Program Administrator; employers, an administrator or Career Services; the reporting-period lifecycle, users and settings, an administrator; programs and campuses and outgoing-email settings, a System Administrator. The Read-Only Auditor can look and run and export reports, but cannot change records.

## Signing in and sessions

- Passwords are stored only as **bcrypt hashes** (cost 12) — never in a form that can be read back — and must be at least 8 characters.
- Sign-in is protected by **rate limiting**: after 10 failed attempts for one account from one address, that account is locked for that address for 15 minutes, and after 50 failed attempts from one address across all accounts, that address is blocked for 15 minutes. Successful sign-ins are not counted, and the limit can't be used to lock a real person out from everywhere. Registration, token refresh and the public link pages are limited too.
- A sign-in produces a short-lived **access token (15 minutes)** kept only in the browser's memory, and a **refresh token (7 days)** held in a cookie that page scripts can't read. Closing the tab ends the in-memory token; the cookie renews it while you work.
- **New accounts are invited, not self-registered.** On a production server, public registration is turned off; an administrator invites each person, who chooses their own password from a single-use link that expires after 7 days. Whoever starts the system creates the first administrator from the server's command line.
- An administrator can **deactivate** an account, which stops any new sign-in or refresh immediately. An access token already issued stays valid until it expires — at most 15 minutes.

## A record of every change

Every create, update and delete made by a signed-in person is written to the **audit history**: who, what, when, and the previous and new values. It appears on the record's Audit History tab (students, programs, reporting periods and others). Sign-offs, override reasons and reopened periods are in it. Changes made by the system itself (scheduled jobs, the seeding script) can't be attributed to a person and are not listed against one. Audit history is never removed by the data-retention cleanup.

## Protecting stored data

- **Secrets** the application must keep — the outgoing-email password and the student-information-system connection secret — are **encrypted** (AES-256-GCM) with a key held in the server's environment, never returned to the browser, and only decrypted at the moment they are used.
- **Security headers** are sent on every response (content-type protections, frame protections and others).
- **Files** — evidence documents, import files and generated reports — are served only to signed-in people with access, never from a public address. Uploads are limited in size.
- **Emailed links** (invitations, password resets and survey links) carry a long random single-purpose token. The email log records that a message was sent, to whom and whether it worked, but **not the message itself**, so a link isn't stored in the log.
- **Do-not-contact.** A student flagged do-not-contact is never emailed a survey and is skipped by outreach campaigns and follow-up logging.
- **Data retention.** Operational records (job history, the email log, read notifications, generated files) are removed after a period each institution controls in Settings; student, enrollment and outcome records and the audit history are not touched.

## What you need to provide

- **HTTPS.** Sign-in cookies are marked secure in production, so the application must be served over HTTPS (a proxy or load balancer in front of it).
- **Encryption of the database and file storage.** OutcomeLink doesn't encrypt the database or the stored files itself; use disk or database encryption at the server level.
- **Backups**, kept somewhere other than the application server. The application can report whether backups are succeeding, but it doesn't take them.
- **Keeping secrets safe** — the encryption key and sign-in signing secrets. Losing the encryption key makes stored connection secrets unreadable; changing the signing secrets signs everyone out.

## Known limits — what it does not do

- **No multi-factor authentication and no single sign-on** (Microsoft, Google or the college's own directory). Sign-in is by email and password.
- **Survey links do not expire.** A graduate or employer survey link works until it is answered once; it can't be used to see anything except that one survey.
- **No immediate session cut-off.** Deactivating a person doesn't end a token they already hold for up to 15 minutes.
- **No Social Security numbers are stored** anywhere in the system.
- **A few college-wide summaries are visible to every signed-in role**, including program-scoped ones: the institution-wide line on the Trends page and the Employer analytics page. They show totals, not individual students.
- **Rate-limit counters are held in the server's memory**, so they reset when the server restarts and would need a shared store before running several servers.
- **Not independently certified.** The application hasn't had an external penetration test or a formal FERPA or accessibility certification. It has automated security-relevant tests, and an automated accessibility audit against WCAG 2.1 AA (see the Q&A), but automated checks find only part of what a review would.
- **Reads are not logged.** The audit history records changes, not who viewed a record.

Questions or concerns about security should go to whoever administers your OutcomeLink installation.
