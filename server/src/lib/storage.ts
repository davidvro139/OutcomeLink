import { randomUUID } from "node:crypto";
<<<<<<< HEAD
import { mkdir, readFile, writeFile } from "node:fs/promises";
=======
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import path from "node:path";
import { env } from "../config/env";

/** Root of every stored file — a persistent volume in a container, ./uploads otherwise. */
const UPLOADS_ROOT = env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

export interface StoredFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface StorageAdapter {
  /** Persists the file and returns a reference the app can use later to retrieve it. */
  save(file: StoredFile): Promise<{ fileReference: string }>;
  /** Reads back a previously-saved file's bytes given its reference. */
  load(fileReference: string): Promise<Buffer>;
<<<<<<< HEAD
=======
  /** Removes a stored file; a file that is already gone is not an error. */
  delete(fileReference: string): Promise<void>;
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

/**
 * Local-disk storage for development. Kept behind the StorageAdapter interface
 * (spec §57/docs/TECH_STACK.md) so evidence files can move to S3-compatible
 * storage later without touching the modules that call save().
 */
export class LocalDiskStorageAdapter implements StorageAdapter {
  constructor(private readonly uploadDir: string) {}

  async save(file: StoredFile): Promise<{ fileReference: string }> {
    await mkdir(this.uploadDir, { recursive: true });
    const extension = path.extname(file.originalName);
    const fileName = `${randomUUID()}${extension}`;
    await writeFile(path.join(this.uploadDir, fileName), file.buffer);
    return { fileReference: fileName };
  }

  async load(fileReference: string): Promise<Buffer> {
    return readFile(path.join(this.uploadDir, fileReference));
  }
<<<<<<< HEAD
=======

  async delete(fileReference: string): Promise<void> {
    await rm(path.join(this.uploadDir, fileReference), { force: true });
  }
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

export const storage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(UPLOADS_ROOT, "evidence"),
);

/**
 * A CSV import batch is re-read and re-parsed at each wizard step (map,
 * validate, preview, commit) rather than persisting parsed rows in the
 * database — separate directory from evidence uploads, same adapter.
 */
export const importStorage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(UPLOADS_ROOT, "imports"),
);

/** Generated .xlsx workbooks from Scheduled Reports (Phase 3, docs/TODO.md) — one file per ScheduledReportRun. */
export const scheduledReportStorage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(UPLOADS_ROOT, "scheduled-reports"),
);

/** Generated .xlsx workbooks from queued Custom Report Builder exports (docs/TODO.md's "Report pagination and bounded exports") — one file per ReportExportJob. */
export const reportExportStorage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(UPLOADS_ROOT, "report-exports"),
);

/**
 * A CSV import batch is re-read and re-parsed at each wizard step (map,
 * validate, preview, commit) rather than persisting parsed rows in the
 * database — separate directory from evidence uploads, same adapter.
 */
export const importStorage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(process.cwd(), "uploads", "imports"),
);

/** Generated .xlsx workbooks from Scheduled Reports (Phase 3, docs/TODO.md) — one file per ScheduledReportRun. */
export const scheduledReportStorage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(process.cwd(), "uploads", "scheduled-reports"),
);
