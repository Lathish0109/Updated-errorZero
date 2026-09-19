import { NextResponse } from "next/server";

import { hashApiKey } from "@/lib/api-keys";
import { displayId, type Bug } from "@/lib/bug-constants";
import { createAdminClient } from "@/lib/supabase/admin";

const AUTOMATION_BOT_EMAIL = "automation@errorzerotracker.local";

const VALID_SEVERITIES: Bug["severity"][] = ["critical", "high", "medium", "low"];
const VALID_PRIORITIES: Bug["priority"][] = ["p1", "p2", "p3", "p4"];

type CreateBugPayload = {
  title: string;
  steps_to_reproduce: string;
  expected_result?: string;
  actual_result?: string;
  additional_context?: string;
  severity?: Bug["severity"];
  priority?: Bug["priority"];
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!providedKey) {
    return jsonError("Missing Authorization: Bearer <api-key> header.", 401);
  }

  const admin = createAdminClient();
  const keyHash = hashApiKey(providedKey);

  const { data: apiKey } = await admin
    .from("api_keys")
    .select("id, project_id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!apiKey) return jsonError("Invalid API key.", 401);
  if (apiKey.revoked_at) return jsonError("This API key has been revoked.", 401);

  let payload: CreateBugPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const title = payload.title?.trim();
  const steps = payload.steps_to_reproduce?.trim();
  if (!title) return jsonError("`title` is required.", 400);
  if (!steps) return jsonError("`steps_to_reproduce` is required.", 400);

  const severity = payload.severity ?? "medium";
  if (!VALID_SEVERITIES.includes(severity)) {
    return jsonError(`\`severity\` must be one of: ${VALID_SEVERITIES.join(", ")}.`, 400);
  }
  const priority = payload.priority ?? "p3";
  if (!VALID_PRIORITIES.includes(priority)) {
    return jsonError(`\`priority\` must be one of: ${VALID_PRIORITIES.join(", ")}.`, 400);
  }

  const { data: bot } = await admin
    .from("profiles")
    .select("id")
    .eq("email", AUTOMATION_BOT_EMAIL)
    .single();
  if (!bot) {
    // Misconfigured deployment, not a caller error.
    return jsonError("Automation reporter account is not set up on this server.", 500);
  }

  const { data: project } = await admin
    .from("projects")
    .select("key")
    .eq("id", apiKey.project_id)
    .single();
  if (!project) return jsonError("This key's project no longer exists.", 409);

  const { data: bug, error: insertError } = await admin
    .from("bugs")
    .insert({
      project_id: apiKey.project_id,
      title,
      steps_to_reproduce: steps,
      expected_result: payload.expected_result?.trim() || null,
      actual_result: payload.actual_result?.trim() || null,
      additional_context: payload.additional_context?.trim() || null,
      severity,
      priority,
      source: "automation",
      reporter_id: bot.id,
      sequence_number: 0, // overwritten by the bugs_set_sequence_number trigger
    })
    .select("id, sequence_number")
    .single();
  if (insertError || !bug) return jsonError("Couldn't create the bug.", 500);

  await admin.from("bug_activity").insert({
    bug_id: bug.id,
    actor_id: bot.id,
    action: "created this bug via the API",
  });

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);

  return NextResponse.json(
    { id: bug.id, displayId: displayId(project.key, bug.sequence_number) },
    { status: 201 },
  );
}
