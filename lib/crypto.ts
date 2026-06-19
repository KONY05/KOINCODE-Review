import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = 1;

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `v${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== `v${VERSION}`) {
    throw new Error("Invalid encrypted envelope format");
  }

  const [, ivHex, tagHex, ciphertextHex] = parts;
  const key = getKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
