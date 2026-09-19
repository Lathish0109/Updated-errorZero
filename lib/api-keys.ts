import { createHash, randomBytes } from "node:crypto";

// Displayed prefix lets an admin tell keys apart in the UI without ever
// storing or re-displaying the secret itself.
const KEY_PREFIX = "ez_live_";
const PREFIX_DISPLAY_CHARS = 8;

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, KEY_PREFIX.length + PREFIX_DISPLAY_CHARS) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length;
}
