import { describe, expect, it } from "vitest";

import { generateApiKey, hashApiKey, looksLikeApiKey } from "@/lib/api-keys";

describe("generateApiKey", () => {
  it("produces a key with the expected prefix", () => {
    const { key } = generateApiKey();
    expect(key.startsWith("ez_live_")).toBe(true);
  });

  it("produces a different key on every call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it("the returned hash matches hashing the key independently", () => {
    const { key, hash } = generateApiKey();
    expect(hashApiKey(key)).toBe(hash);
  });

  it("the display prefix is a truncated, non-secret slice of the key", () => {
    const { key, prefix } = generateApiKey();
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(key.length);
  });
});

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("ez_live_abc")).toBe(hashApiKey("ez_live_abc"));
  });

  it("different keys hash differently", () => {
    expect(hashApiKey("ez_live_abc")).not.toBe(hashApiKey("ez_live_xyz"));
  });
});

describe("looksLikeApiKey", () => {
  it("accepts a well-formed key", () => {
    expect(looksLikeApiKey("ez_live_somesecret")).toBe(true);
  });

  it("rejects values without the prefix", () => {
    expect(looksLikeApiKey("not-a-key")).toBe(false);
    expect(looksLikeApiKey("")).toBe(false);
  });

  it("rejects the bare prefix with no secret", () => {
    expect(looksLikeApiKey("ez_live_")).toBe(false);
  });
});
