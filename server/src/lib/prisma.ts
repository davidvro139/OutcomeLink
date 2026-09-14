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
 * Scope: covers single-record create/update/delete only (not createMany/
 * updateMany/deleteMany/upsert, and not nested relation writes) — that
 * covers the CRUD patterns the modules in server/src/modules use. Update
 * diffs are computed per scalar field, matching docs/DATA_MODEL.md's
 * AuditLogEntry shape (one row per changed field, not per operation).
 */

const rawPrisma = new PrismaClient();

type Delegate = {
  findUnique: (args: { where: { id: number } }) => Promise<Record<string, unknown> | null>;
};

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
  return value instanceof Date ? value.toISOString() : String(value);
}

export const prisma = rawPrisma.$extends({
  name: "auditLog",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const auditable =
          operation === "create" || operation === "update" || operation === "delete";
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
            for (const [field, newValue] of Object.entries(data)) {
              // Skip nested relation writes (e.g. { connect: { id } }), but Date is a
              // real scalar value here, not a relation payload — typeof would otherwise
              // silently drop every date-field change from the audit log.
              if (typeof newValue === "object" && newValue !== null && !(newValue instanceof Date))
                continue;
              // Compare the stringified forms, not the raw values: two distinct Date
              // instances for the same instant are never === by reference, which would
              // otherwise log a "change" on every no-op resubmission of the same date.
              const previousValue = stringifyForAudit(before[field]);
              const nextValue = stringifyForAudit(newValue);
              if (previousValue !== nextValue) {
                await writeAuditEntry({
                  model,
                  entityId: where.id,
                  action: AuditAction.UPDATE,
                  userId,
                  fieldChanged: field,
                  previousValue,
                  newValue: nextValue,
                });
              }
            }
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
