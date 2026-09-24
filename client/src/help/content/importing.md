---
title: Importing from your student information system
slug: importing
group: Guides
order: 4
reviewed: 2026-09-24
---

**Bulk Import** (Administration → Bulk Import) brings students, and optionally their enrollments, in from a CSV or Excel export. Administrators and Program Administrators can import.

## The steps

1. **Upload.** Choose **New Import**, name the system the file came from (for example "Northstar" or "OneWorld") and choose the file (CSV or Excel). The name is used to suggest a saved column mapping next time.
2. **Map columns.** Match each of the file's columns to a field: student ID, names, email, phone, and — if you want enrollments created too — program code, start date, enrollment status, completion dates, credential and objective. Save the mapping as a **profile** so next term's export needs no re-mapping. If you map any enrollment field, program code, start date and status become required together.
3. **Validate.** Every row is checked. Rows with problems are listed with the reason — a missing required value, a duplicate ID inside the file, an ID that already exists, an unknown program code — and are never silently dropped.
4. **Preview.** Look through the rows that passed.
5. **Commit.** Only the valid rows are created. If a returning student appears in a later term's file and enrollment fields are mapped, they get a new enrollment rather than an error.

Re-running the same or an overlapping file is safe: rows already imported are recognized and skipped.

## Live connection

**Data connections** lets an administrator connect to a Microsoft Dataverse (Dynamics 365 / Power Platform) source, such as OneWorld SIS, and pull a table straight into the same wizard. It has been tested only against simulated responses, so expect to adjust the table and column names the first time you use it.

## Tips

- Program codes must match a program that already exists — the import never creates programs.
- An import can't be undone as a whole; correct individual records afterwards from the student page, or ask an administrator.
- Everything an import creates appears in the audit history under the person who ran it.
