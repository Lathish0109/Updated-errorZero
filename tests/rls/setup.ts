// Fixtures + clients for the RLS/permission test suite (Layer 2). These
// tests exercise the *real* Postgres policies on the live Supabase project
// -- see AGENTS.md / the test-plan blueprint for why: only a real sign-in +
// real query proves what the policy text actually allows.
//
// All fixture rows are tagged TEST_RLS and deleted in afterAll. If a run
// crashes before cleanup, `node scripts/cleanup-test-data.mjs` sweeps them.

import { readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

function loadEnvLocal() {
  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // Assume the environment already has these set (e.g. CI secrets).
  }
}
loadEnvLocal();

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export function assertEnv() {
  const missing = [
    !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    !SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
    !ADMIN_EMAIL && "ADMIN_EMAIL",
    !ADMIN_PASSWORD && "ADMIN_PASSWORD",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `RLS tests need these set (ADMIN_EMAIL/ADMIN_PASSWORD are passed at invocation, not stored): ${missing.join(", ")}`,
    );
  }
}

export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function signInAs(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

export const TEST_PREFIX = "TEST_RLS";
const TEST_PASSWORD = "RlsTest!2026x";

const TEST_USER_DEFS = {
  manager: { email: "test-rls-manager@errorzerotest.local", role: "manager" as const },
  developer: { email: "test-rls-developer@errorzerotest.local", role: "developer" as const },
  tester: { email: "test-rls-tester@errorzerotest.local", role: "tester" as const },
  viewer: { email: "test-rls-viewer@errorzerotest.local", role: "viewer" as const },
};

export type TestUserKey = keyof typeof TEST_USER_DEFS;

export type Fixtures = {
  adminEmail: string;
  adminPassword: string;
  users: Record<TestUserKey, { id: string; email: string; password: string }>;
  projectAId: string;
  projectBId: string;
  bugId: string;
};

export async function seedFixtures(): Promise<Fixtures> {
  assertEnv();
  const service = createServiceClient();

  const { data: adminProfile, error: adminErr } = await service
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .single();
  if (adminErr || !adminProfile) {
    throw new Error("No admin profile found in this project -- run scripts/seed-admin.mjs first.");
  }
  const adminId = adminProfile.id;

  const users = {} as Fixtures["users"];
  for (const [key, def] of Object.entries(TEST_USER_DEFS)) {
    const { data: existing } = await service.auth.admin.listUsers();
    let userId = existing?.users.find((u) => u.email === def.email)?.id;
    if (!userId) {
      const { data, error } = await service.auth.admin.createUser({
        email: def.email,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userId = data.user.id;
    }
    const { error: profileError } = await service.from("profiles").upsert({
      id: userId,
      full_name: `${TEST_PREFIX} ${def.role}`,
      email: def.email,
      role: def.role,
      status: "active",
    });
    if (profileError) throw profileError;
    users[key as TestUserKey] = { id: userId, email: def.email, password: TEST_PASSWORD };
  }

  // Clear out any projects left behind by a crashed previous run, then
  // create fresh ones so fixtures start from a known state.
  await service.from("projects").delete().in("key", ["TRLSA", "TRLSB"]);

  const { data: projectA, error: projErrA } = await service
    .from("projects")
    .insert({
      name: `${TEST_PREFIX} Project A (has members)`,
      key: "TRLSA",
      description: "RLS test fixture",
      created_by: adminId,
    })
    .select("id")
    .single();
  if (projErrA || !projectA) throw projErrA ?? new Error("Failed to create project A");

  const { data: projectB, error: projErrB } = await service
    .from("projects")
    .insert({
      name: `${TEST_PREFIX} Project B (isolation control)`,
      key: "TRLSB",
      description: "No test user is a member of this one",
      created_by: adminId,
    })
    .select("id")
    .single();
  if (projErrB || !projectB) throw projErrB ?? new Error("Failed to create project B");

  await service.from("project_members").insert([
    { project_id: projectA.id, user_id: users.developer.id },
    { project_id: projectA.id, user_id: users.tester.id },
    { project_id: projectA.id, user_id: users.viewer.id },
  ]);

  const { data: bug, error: bugErr } = await service
    .from("bugs")
    .insert({
      project_id: projectA.id,
      title: `${TEST_PREFIX} fixture bug`,
      steps_to_reproduce: "n/a",
      severity: "low",
      priority: "p4",
      source: "manual",
      reporter_id: users.developer.id,
      assignee_id: users.tester.id,
      sequence_number: 0,
    })
    .select("id")
    .single();
  if (bugErr || !bug) throw bugErr ?? new Error("Failed to create fixture bug");

  return {
    adminEmail: ADMIN_EMAIL!,
    adminPassword: ADMIN_PASSWORD!,
    users,
    projectAId: projectA.id,
    projectBId: projectB.id,
    bugId: bug.id,
  };
}

export async function cleanupFixtures(fixtures: Fixtures, extraProjectIds: string[] = []) {
  const service = createServiceClient();
  await service.from("bugs").delete().eq("project_id", fixtures.projectAId);
  await service
    .from("project_members")
    .delete()
    .in("project_id", [fixtures.projectAId, fixtures.projectBId, ...extraProjectIds]);
  await service
    .from("projects")
    .delete()
    .in("id", [fixtures.projectAId, fixtures.projectBId, ...extraProjectIds]);
  for (const user of Object.values(fixtures.users)) {
    await service.auth.admin.deleteUser(user.id);
  }
}
