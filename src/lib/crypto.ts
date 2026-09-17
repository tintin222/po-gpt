import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption for secrets at rest (provider API keys).
 * Key is derived from APP_ENCRYPTION_KEY (preferred) or AUTH_SECRET.
 */
function getKey(): Buffer {
  const source = process.env.APP_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!source) {
    throw new Error(
      "APP_ENCRYPTION_KEY (or AUTH_SECRET) must be set to encrypt provider API keys"
    );
  }
  return createHash("sha256").update(source).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(encrypted: string): string {
  const [ivB64, tagB64, dataB64] = encrypted.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
