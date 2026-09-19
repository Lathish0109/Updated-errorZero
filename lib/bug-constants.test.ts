import { describe, expect, it } from "vitest";

import { displayId, isAllowedAttachment, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/bug-constants";

describe("displayId", () => {
  it("joins the project key and sequence number", () => {
    expect(displayId("DEMO", 42)).toBe("DEMO-42");
  });
});

describe("isAllowedAttachment", () => {
  it("accepts a normal-sized image", () => {
    expect(isAllowedAttachment({ type: "image/png", size: 1024 })).toBe(true);
  });

  it("accepts a file at exactly the size limit", () => {
    expect(isAllowedAttachment({ type: "application/pdf", size: MAX_ATTACHMENT_SIZE_BYTES })).toBe(
      true,
    );
  });

  it("rejects a file over the size limit", () => {
    expect(isAllowedAttachment({ type: "image/png", size: MAX_ATTACHMENT_SIZE_BYTES + 1 })).toBe(
      false,
    );
  });

  it("rejects a zero-byte file", () => {
    expect(isAllowedAttachment({ type: "image/png", size: 0 })).toBe(false);
  });

  it("rejects an unsupported file type", () => {
    expect(isAllowedAttachment({ type: "application/x-msdownload", size: 1024 })).toBe(false);
  });

  it("allows an empty MIME type (some OSes report this for known-safe files)", () => {
    expect(isAllowedAttachment({ type: "", size: 1024 })).toBe(true);
  });
});
