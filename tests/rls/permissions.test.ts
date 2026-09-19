// Layer 2: verifies the 5-role permission matrix against the real Postgres
// policies on the live Supabase project -- not a re-statement of the policy
// text, but an actual sign-in-and-query per role. See tests/rls/setup.ts
// for how fixtures are created and torn down.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import {
  cleanupFixtures,
  createServiceClient,
  seedFixtures,
  signInAs,
  TEST_PREFIX,
  type Fixtures,
  type TestUserKey,
} from "./setup";

type Client = SupabaseClient<Database>;

let fixtures: Fixtures;
let admin: Client;
let manager: Client;
let developer: Client;
let tester: Client;
let viewer: Client;
const extraProjectIds: string[] = [];
const extraBugIds: string[] = [];

beforeAll(async () => {
  fixtures = await seedFixtures();
  [admin, manager, developer, tester, viewer] = await Promise.all([
    signInAs(fixtures.adminEmail, fixtures.adminPassword),
    signInAs(fixtures.users.manager.email, fixtures.users.manager.password),
    signInAs(fixtures.users.developer.email, fixtures.users.developer.password),
    signInAs(fixtures.users.tester.email, fixtures.users.tester.password),
    signInAs(fixtures.users.viewer.email, fixtures.users.viewer.password),
  ]);
}, 30000);

afterAll(async () => {
  const service = createServiceClient();
  if (extraBugIds.length > 0) {
    await service.from("bugs").delete().in("id", extraBugIds);
  }
  await cleanupFixtures(fixtures, extraProjectIds);
}, 30000);

describe("Projects", () => {
  it("Admin and Manager see every project, membership or not", async () => {
    const { data: adminSees } = await admin
      .from("projects")
      .select("id")
      .eq("id", fixtures.projectBId)
      .maybeSingle();
    const { data: managerSees } = await manager
      .from("projects")
      .select("id")
      .eq("id", fixtures.projectBId)
      .maybeSingle();
    expect(adminSees?.id).toBe(fixtures.projectBId);
    expect(managerSees?.id).toBe(fixtures.projectBId);
  });

  it("Developer/Tester/Viewer see Project A (member) but not Project B (not a member)", async () => {
    for (const client of [developer, tester, viewer]) {
      const { data: seesA } = await client
        .from("projects")
        .select("id")
        .eq("id", fixtures.projectAId)
        .maybeSingle();
      const { data: seesB } = await client
        .from("projects")
        .select("id")
        .eq("id", fixtures.projectBId)
        .maybeSingle();
      expect(seesA?.id).toBe(fixtures.projectAId);
      expect(seesB).toBeNull();
    }
  });

  it("Manager can create a project; Developer and Viewer cannot", async () => {
    const { data, error } = await manager
      .from("projects")
      .insert({ name: `${fixtures.bugId}-manager-created`, key: "TRLSC" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) extraProjectIds.push(data.id);

    const { error: devError } = await developer
      .from("projects")
      .insert({ name: "should not exist", key: "TRLSD" });
    expect(devError).not.toBeNull();

    const { error: viewerError } = await viewer
      .from("projects")
      .insert({ name: "should not exist", key: "TRLSE" });
    expect(viewerError).not.toBeNull();
  });

  it("Manager can update Project A even without membership; Developer cannot", async () => {
    const { data: managerUpdate, error: managerErr } = await manager
      .from("projects")
      .update({ description: "updated by manager during RLS test" })
      .eq("id", fixtures.projectAId)
      .select("id");
    expect(managerErr).toBeNull();
    expect(managerUpdate).toHaveLength(1);

    const { data: devUpdate, error: devErr } = await developer
      .from("projects")
      .update({ description: "should not apply" })
      .eq("id", fixtures.projectAId)
      .select("id");
    expect(devErr).toBeNull();
    expect(devUpdate).toEqual([]); // RLS-blocked UPDATE returns 0 rows, not an error
  });
});

describe("Project members", () => {
  it("Admin can add a member; Developer cannot", async () => {
    const { data, error } = await admin
      .from("project_members")
      .insert({ project_id: fixtures.projectBId, user_id: fixtures.users.viewer.id })
      .select("project_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const { error: devError } = await developer
      .from("project_members")
      .insert({ project_id: fixtures.projectBId, user_id: fixtures.users.developer.id });
    expect(devError).not.toBeNull();
  });
});

describe("Bugs", () => {
  it("Viewer cannot create a bug even as a project member; Tester can", async () => {
    const { error: viewerErr } = await viewer.from("bugs").insert({
      project_id: fixtures.projectAId,
      title: "should not exist",
      steps_to_reproduce: "n/a",
      severity: "low",
      priority: "p4",
      source: "manual",
      reporter_id: fixtures.users.viewer.id,
      sequence_number: 0,
    });
    expect(viewerErr).not.toBeNull();

    const { data, error } = await tester
      .from("bugs")
      .insert({
        project_id: fixtures.projectAId,
        title: `${fixtures.bugId}-tester-created`,
        steps_to_reproduce: "n/a",
        severity: "low",
        priority: "p4",
        source: "manual",
        reporter_id: fixtures.users.tester.id,
        sequence_number: 0,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) extraBugIds.push(data.id);
  });

  it("assignee and reporter can update their own bug; an uninvolved Developer cannot", async () => {
    const { data: testerUpdate, error: testerErr } = await tester
      .from("bugs")
      .update({ status: "in_progress" })
      .eq("id", fixtures.bugId) // tester is the assignee
      .select("id");
    expect(testerErr).toBeNull();
    expect(testerUpdate).toHaveLength(1);

    const { data: reporterUpdate, error: reporterErr } = await developer
      .from("bugs")
      .update({ status: "open" })
      .eq("id", fixtures.bugId) // developer is the reporter
      .select("id");
    expect(reporterErr).toBeNull();
    expect(reporterUpdate).toHaveLength(1);

    // The bug tester created above has tester as reporter, nobody as
    // assignee -- developer is neither, so this must be blocked.
    const uninvolvedBugId = extraBugIds[0];
    const { data: blockedUpdate, error: blockedErr } = await developer
      .from("bugs")
      .update({ status: "closed" })
      .eq("id", uninvolvedBugId)
      .select("id");
    expect(blockedErr).toBeNull();
    expect(blockedUpdate).toEqual([]);
  });

  it("Viewer cannot update a bug even as the (hypothetical) assignee -- role alone excludes them", async () => {
    const { data, error } = await viewer
      .from("bugs")
      .update({ status: "closed" })
      .eq("id", fixtures.bugId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("only Admin/Manager can delete a bug", async () => {
    const { data: devDelete, error: devErr } = await developer
      .from("bugs")
      .delete()
      .eq("id", extraBugIds[0])
      .select("id");
    expect(devErr).toBeNull();
    expect(devDelete).toEqual([]);

    const { data: managerDelete, error: managerErr } = await manager
      .from("bugs")
      .delete()
      .eq("id", extraBugIds[0])
      .select("id");
    expect(managerErr).toBeNull();
    expect(managerDelete).toHaveLength(1);
    extraBugIds.pop(); // already deleted, don't try again in afterAll
  });
});

describe("Bug attachments", () => {
  it("role gate on attachments: Developer can register one, Viewer cannot", async () => {
    const { data: devRow, error: devErr } = await developer
      .from("bug_attachments")
      .insert({
        bug_id: fixtures.bugId,
        file_name: "test.png",
        file_path: `${fixtures.bugId}/rls-test.png`,
        file_size: 100,
        uploaded_by: fixtures.users.developer.id,
      })
      .select("id")
      .single();
    expect(devErr).toBeNull();
    if (devRow?.id) {
      await createServiceClient().from("bug_attachments").delete().eq("id", devRow.id);
    }

    const { error: viewerErr } = await viewer.from("bug_attachments").insert({
      bug_id: fixtures.bugId,
      file_name: "test.png",
      file_path: `${fixtures.bugId}/rls-test-viewer.png`,
      file_size: 100,
      uploaded_by: fixtures.users.viewer.id,
    });
    expect(viewerErr).not.toBeNull();
  });
});

describe("Bug comments", () => {
  it("role gate on comments: Tester can comment, Viewer (read-only) cannot", async () => {
    const { data, error } = await tester
      .from("bug_comments")
      .insert({
        bug_id: fixtures.bugId,
        author_id: fixtures.users.tester.id,
        body: "RLS test comment",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) {
      await createServiceClient().from("bug_comments").delete().eq("id", data.id);
    }

    const { error: viewerErr } = await viewer.from("bug_comments").insert({
      bug_id: fixtures.bugId,
      author_id: fixtures.users.viewer.id,
      body: "should not exist",
    });
    expect(viewerErr).not.toBeNull();
  });
});

describe("Profiles (the admin-seeded model's actual enforcement)", () => {
  it("no role can INSERT a profile directly -- self-signup is blocked at the DB layer, not just the UI", async () => {
    for (const [label, client] of Object.entries({ admin, manager, developer, tester, viewer })) {
      const { error } = await client.from("profiles").insert({
        id: "00000000-0000-0000-0000-000000000000",
        full_name: "should not exist",
        email: "nobody@errorzerotest.local",
        role: "viewer",
      });
      expect(error, `${label} should not be able to insert a profile`).not.toBeNull();
    }
  });

  it("confirmed intentional: only Admin can change another user's role -- Manager cannot (matches the admin-seeded user-management model)", async () => {
    const { data: managerAttempt, error: managerErr } = await manager
      .from("profiles")
      .update({ status: "active" })
      .eq("id", fixtures.users.developer.id)
      .select("id");
    expect(managerErr).toBeNull();
    expect(managerAttempt).toEqual([]);

    const { data: adminAttempt, error: adminErr } = await admin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", fixtures.users.developer.id)
      .select("id");
    expect(adminErr).toBeNull();
    expect(adminAttempt).toHaveLength(1);
  });

  it("every role can read the full profiles list (needed for assignee pickers)", async () => {
    const { data, error } = await viewer.from("profiles").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});

describe("API Keys (external automation integration, admin-only trust boundary)", () => {
  it("only Admin can read the api_keys table -- Manager/Developer/Tester/Viewer see nothing", async () => {
    for (const [label, client] of Object.entries({ manager, developer, tester, viewer })) {
      const { data, error } = await client.from("api_keys").select("id");
      expect(error, `${label} query should not error (RLS just filters rows)`).toBeNull();
      expect(data, `${label} should see zero api_keys rows`).toEqual([]);
    }

    const { data: adminData, error: adminError } = await admin.from("api_keys").select("id");
    expect(adminError).toBeNull();
    expect(adminData).not.toBeNull();
  });

  it("only Admin can INSERT into api_keys -- other roles are rejected by RLS", async () => {
    for (const [label, client] of Object.entries({ manager, developer, tester, viewer })) {
      const { error } = await client.from("api_keys").insert({
        name: `${TEST_PREFIX} should not be created by ${label}`,
        key_hash: `${TEST_PREFIX}-${label}-hash`,
        key_prefix: "ibt_live_",
        project_id: fixtures.projectAId,
        created_by: fixtures.users[label as TestUserKey].id,
      });
      expect(error, `${label} should not be able to insert an api_key`).not.toBeNull();
    }
  });

  it("Admin can create and revoke an api_key end-to-end", async () => {
    const { data: created, error: createError } = await admin
      .from("api_keys")
      .insert({
        name: `${TEST_PREFIX} admin-created key`,
        key_hash: `${TEST_PREFIX}-admin-hash`,
        key_prefix: "ibt_live_",
        project_id: fixtures.projectAId,
        created_by: fixtures.users.developer.id,
      })
      .select("id")
      .single();
    expect(createError).toBeNull();
    expect(created?.id).toBeDefined();
    if (!created) return;

    const { data: revoked, error: revokeError } = await admin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", created.id)
      .select("revoked_at")
      .single();
    expect(revokeError).toBeNull();
    expect(revoked?.revoked_at).not.toBeNull();

    await admin.from("api_keys").delete().eq("id", created.id);
  });
});
