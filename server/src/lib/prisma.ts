import { AuditAction, PrismaClient } from "@prisma/client";
import { getRequestContext } from "./requestContext";
import { logger } from "./logger";

/**
 * Automatic audit logging (spec §15), implemented once at the Prisma layer so
 * every module gets it for free instead of remembering to call an audit
 * service on every write (see docs/TODO.md stage 2). `rawPrisma` is the
 * unextended client used internally by the extension itself, so its own
 * writes to `audit_log_entries` don't recurse back through this logic.
 *
 * Scope: covers single-record create/update/delete/upsert (not createMany/
 * updateMany/deleteMany, and not nested relation writes) — that covers the
 * CRUD patterns the modules in server/src/modules use. Update diffs are
 * computed per scalar field, matching docs/DATA_MODEL.md's AuditLogEntry
 * shape (one row per changed field, not per operation).
 *
 * upsert (docs/TODO.md's "audit upsert operations"): used for consent /
 * do-not-contact, saved reports, mapping profiles and follow-up owners, so
 * skipping it left exactly the writes with the strongest need for history
 * unlogged. Prisma gives no signal for whether an upsert created or
 * updated, so the row is read first (by the same unique `where`) and the
 * write is logged as a create or a per-field diff accordingly.
 */

const rawPrisma = new PrismaClient();

type Delegate = {
  findUnique: (args: { where: unknown }) => Promise<Record<string, unknown> | null>;
};

/**
 * Models whose upserts are derived, recomputable output rather than a user's
 * edit — the CPL recalculation upserts one classification + explanation per
 * enrollment per metric (thousands per run) from inputs that are themselves
 * audited, so logging them would bury real history under noise.
 */
const UNAUDITED_UPSERT_MODELS = new Set(["StudentClassification", "CplCalculationExplanation"]);

/**
 * Some models have no history view of their own but belong to a record that
 * does — their changes are filed under that parent so they show up where a
 * reviewer would actually look (a student's do-not-contact history belongs
 * on the student, not under an opaque preference-row id).
 */
interface AuditSubject {
  entityType: string;
  entityId: number;
  fieldPrefix: string;
  skipFields: string[];
}
const AUDIT_SUBJECTS: Record<string, (row: Record<string, unknown>) => AuditSubject> = {
  StudentCommunicationPreference: (row) => ({
    entityType: "Student",
    entityId: row.studentId as number,
    fieldPrefix: "communicationPreference.",
    skipFields: ["studentId"],
  }),
};

const RELATION_WRITE_KEYS = new Set([
  "connect", "create", "connectOrCreate", "disconnect", "update", "upsert", "delete", "set",
  "createMany", "updateMany", "deleteMany",
]);

/** A nested relation write (`{ connect: { id } }`), as opposed to a scalar value that happens to be an object (Date, JSON). */
function isRelationWrite(value: unknown): boolean {
  if (typeof value !== "object" || value === null || value instanceof Date || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => RELATION_WRITE_KEYS.has(k));
}

/** Stable key order — MySQL normalizes JSON key order, so raw stringification would log phantom changes. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function delegateFor(model: string): Delegate {
  const property = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = (rawPrisma as unknown as Record<string, Delegate | undefined>)[property];
  if (!delegate) throw new Error(`No Prisma delegate found for model "${model}"`);
  return delegate;
}

interface AuditEntryInput {
  model: string;
  entityId: number;
  action: AuditAction;
  userId: number;
  fieldChanged?: string;
  previousValue?: string | null;
  newValue?: string | null;
}

async function writeAuditEntry(entry: AuditEntryInput) {
  try {
    await rawPrisma.auditLogEntry.create({
      data: {
        entityType: entry.model,
        entityId: entry.entityId,
        action: entry.action,
        fieldChanged: entry.fieldChanged,
        previousValue: entry.previousValue ?? undefined,
        newValue: entry.newValue ?? undefined,
        userId: entry.userId,
      },
    });
  } catch (err) {
    // Audit logging must never take down the primary write it's observing.
    logger.error({ err, entry }, "Failed to write audit log entry");
  }
}

function stringifyForAudit(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  // Prisma Decimal columns come back as Decimal objects but are written as plain numbers/strings.
  if (typeof value === "object" && value.constructor?.name !== "Decimal") return canonicalJson(value);
  return String(value);
}

/** One UPDATE entry per scalar field whose stringified value actually changed. */
async function writeFieldDiffs(
  model: string,
  entityId: number,
  before: Record<string, unknown> | null,
  data: Record<string, unknown>,
  userId: number,
) {
  const subject = AUDIT_SUBJECTS[model]?.(before ?? {});
  for (const [field, newValue] of Object.entries(data)) {
    // Skip nested relation writes (e.g. { connect: { id } }), but Date and JSON
    // columns are real scalar values, not relation payloads — a blanket
    // typeof-object skip would silently drop every date/JSON change.
    if (newValue === undefined || isRelationWrite(newValue)) continue;
    if (subject?.skipFields.includes(field)) continue;
    // Compare the stringified forms, not the raw values: two distinct Date
    // instances for the same instant are never === by reference, which would
    // otherwise log a "change" on every no-op resubmission of the same date.
    const previousValue = stringifyForAudit(before?.[field]);
    const nextValue = stringifyForAudit(newValue);
    if (previousValue === nextValue) continue;
    await writeAuditEntry({
      model: subject?.entityType ?? model,
      entityId: subject?.entityId ?? entityId,
      action: AuditAction.UPDATE,
      userId,
      fieldChanged: `${subject?.fieldPrefix ?? ""}${field}`,
      previousValue,
      newValue: nextValue,
    });
  }
}

export const prisma = rawPrisma.$extends({
  name: "auditLog",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const auditable =
          operation === "create" ||
          operation === "update" ||
          operation === "delete" ||
          operation === "upsert";
        if (model === "AuditLogEntry" || !auditable) {
          return query(args);
        }

        const userId = getRequestContext()?.userId;
        if (!userId) {
          // System-initiated writes (seed scripts, migrations, background jobs)
          // aren't attributable to a user — skip rather than fail the write
          // or invent a fake actor.
          return query(args);
        }

        if (operation === "upsert") {
          if (UNAUDITED_UPSERT_MODELS.has(model)) return query(args);
          const {
            where: upsertWhere,
            create,
            update,
          } = args as {
            where: unknown;
            create?: Record<string, unknown>;
            update?: Record<string, unknown>;
          };
          const before = await delegateFor(model).findUnique({ where: upsertWhere });
          const result = await query(args);
          const id = (result as { id?: number })?.id;
          if (typeof id !== "number") return result;

          if (before) {
            await writeFieldDiffs(model, id, before, update ?? {}, userId);
          } else if (AUDIT_SUBJECTS[model]) {
            // A first-ever value for a subject-filed model is still worth
            // seeing field by field (e.g. the initial do-not-contact flag).
            const subject = AUDIT_SUBJECTS[model](result as Record<string, unknown>);
            for (const [field, value] of Object.entries(create ?? {})) {
              if (value === undefined || value === null || isRelationWrite(value)) continue;
              if (subject.skipFields.includes(field)) continue;
              await writeAuditEntry({
                model: subject.entityType,
                entityId: subject.entityId,
                action: AuditAction.UPDATE,
                userId,
                fieldChanged: `${subject.fieldPrefix}${field}`,
                previousValue: null,
                newValue: stringifyForAudit(value),
              });
            }
          } else {
            await writeAuditEntry({ model, entityId: id, action: AuditAction.CREATE, userId });
          }
          return result;
        }

        if (operation === "create") {
          const result = await query(args);
          const id = (result as { id?: number })?.id;
          if (typeof id === "number") {
            await writeAuditEntry({ model, entityId: id, action: AuditAction.CREATE, userId });
          }
          return result;
        }

        const where = (args as { where?: { id?: number } }).where;

        if (operation === "update") {
          const before = where?.id
            ? await delegateFor(model).findUnique({ where: { id: where.id } })
            : null;
          const result = await query(args);

          if (before && where?.id) {
            const data = (args as { data?: Record<string, unknown> }).data ?? {};
            await writeFieldDiffs(model, where.id, before, data, userId);
          }

          return result;
        }

        // delete
        const result = await query(args);
        if (where?.id) {
          await writeAuditEntry({ model, entityId: where.id, action: AuditAction.DELETE, userId });
        }
        return result;
      },
    },
  },
});
