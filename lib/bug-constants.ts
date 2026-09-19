import type { Enums, Tables } from "@/types/database";

export type Bug = Tables<"bugs">;
export type BugLabel = Enums<"bug_label">;

export type BugWithRelations = Bug & {
  projectName: string;
  projectKey: string;
  assigneeName: string | null;
  reporterName: string;
  labels: string[];
};

export const STATUS_LABELS: Record<Bug["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<Bug["priority"], string> = {
  p1: "P1 - Critical",
  p2: "P2 - High",
  p3: "P3 - Medium",
  p4: "P4 - Low",
};

export const SEVERITY_LABELS: Record<Bug["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SOURCE_LABELS: Record<Bug["source"], string> = {
  manual: "Manual QA",
  automation: "Automation",
  user_reported: "User Reported",
};

export function displayId(projectKey: string, sequenceNumber: number) {
  return `${projectKey}-${sequenceNumber}`;
}

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export function isAllowedAttachment(file: { type: string; size: number }) {
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) return false;
  // Some browsers/OSes report an empty MIME type for known-safe files (e.g.
  // .log); allow that rather than rejecting valid attachments.
  return file.type === "" || ALLOWED_ATTACHMENT_TYPES.includes(file.type);
}

// Rejects non-http(s) schemes (e.g. javascript:) so a pasted image URL can
// never be rendered back out as a clickable link that executes script.
export function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
