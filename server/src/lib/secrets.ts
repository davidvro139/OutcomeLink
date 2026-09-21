import crypto from "node:crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * At-rest encryption for real external credentials stored in the database —
 * currently only DataSourceConnection.clientSecretEncrypted (a Dataverse/
 * Azure AD app registration secret, which grants live read access to an
 * institution's actual SIS data, a materially higher-stakes secret than
 * anything else this app stores). Password hashing (lib/password.ts) is
 * one-way and unrelated; this is reversible by design, since the whole point
 * is to hand the plaintext secret back to Dataverse's token endpoint on each
 * outbound request.
 *
 * SECRETS_ENCRYPTION_KEY can be any string — it's hashed into a fixed-length
 * key rather than required to already be exactly 32 bytes, the same
 * "config a human can actually set" reasoning JWT_ACCESS_SECRET etc. use.
 */
function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(env.SECRETS_ENCRYPTION_KEY).digest();
}

/** Format: base64(iv).base64(authTag).base64(ciphertext) — self-contained, no external key material needed to decrypt besides SECRETS_ENCRYPTION_KEY. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret payload");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
