---
title: Administration
slug: administration
group: Guides
order: 7
reviewed: 2026-09-24
---

For System and Institutional Administrators.

## Users

**Users** lists everyone at the institution. **Invite User** creates an account and emails the person a single-use link (valid 7 days) to choose their password; if email isn't set up, you're shown the link to pass on yourself. From a person's row you can edit them, send a password reset, or deactivate and reactivate them. Program Administrators and Read-Only Auditors also need **programs and campuses assigned** — until they are, they see nothing.

## Settings

**Settings** has three tabs.

- **Email.** Each institution can set its own outgoing mail server (host, port, login, "send from" address) — a System Administrator edits it; Institutional Administrators can view it. **Send test email to me** confirms it works. If an institution sets nothing, the server's own settings are used; if there are none, invitations and surveys show a link to copy instead. The password is stored encrypted and never shown again.
- **Data retention.** How long to keep job history and run records (default 180 days), the email log (180), read notifications (90) and generated export files (30). A cleanup runs every night; **Run cleanup now** does it on demand. Student, enrollment and outcome records and the audit history are never removed.
- **Backups.** The application does not take backups; whoever runs the server should schedule them. This tab shows whether the backup job has reported in and warns if the last success is too old (36 hours by default). System Administrators are notified once a day while it stays stale.

## Job History

**Job History** lists everything that ran in the background — scheduled reports, nightly validation, follow-up automation, outreach campaigns, cleanups — with its status and how many attempts it took. A scheduled job that fails is retried automatically; a manual one that fails has a **Retry** button. The **Email log** tab shows every email the application tried to send and whether it worked.

## Programs and campuses

Programs, campuses, departments and negotiated benchmarks are managed by System Administrators from **Programs**. A program's page also lets administrators choose its **follow-up owner**.

## Keeping it healthy

- Check **My Programs**, the Close-out tab and the Backups tab regularly.
- After a bulk import, run **Compute** for the current period so dashboards reflect it.
- Keep at least two administrators so an invitation or reset is never blocked on one person.
