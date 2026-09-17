import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
}

export const storage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(process.cwd(), "uploads", "evidence"),
);

/**
 * A CSV import batch is re-read and re-parsed at each wizard step (map,
 * validate, preview, commit) rather than persisting parsed rows in the
 * database — separate directory from evidence uploads, same adapter.
 */
export const importStorage: StorageAdapter = new LocalDiskStorageAdapter(
  path.join(process.cwd(), "uploads", "imports"),
);
