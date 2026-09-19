import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/services/profile";
import type { Tables } from "@/types/database";

// createUserAccount/updateUserAccount use the service-role client (required
// to call Supabase's admin.auth.admin API), which bypasses RLS entirely --
// so, unlike every other mutation in this app, this check is the *only*
// thing standing between a request and full account takeover. Per the
// Next.js Server Actions guidance, page/layout gating is not a security
// boundary: an action is reachable by anyone who can POST to it directly,
// regardless of which UI route is hidden from them.
async function assertCallerIsAdmin() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") {
    throw new Error("Only an admin can manage user accounts.");
  }
}

export type Profile = Tables<"profiles">;

export type UserWithStats = Profile & {
  projectNames: string[];
  activeBugs: number;
};

export async function getUsers(
  options: { page?: number; pageSize?: number } = {},
): Promise<{ users: UserWithStats[]; totalCount: number }> {
  const { page = 1, pageSize = 15 } = options;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();

  const {
    data: profiles,
    error,
    count,
  } = await supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: true })
    .range(from, to);
  if (error || !profiles) return { users: [], totalCount: 0 };

  const profileIds = profiles.map((p) => p.id);
  const [{ data: memberships }, { data: bugs }] = await Promise.all([
    supabase.from("project_members").select("user_id, projects(name)").in("user_id", profileIds),
    supabase.from("bugs").select("assignee_id, status").in("assignee_id", profileIds),
  ]);

  const users = profiles.map((profile) => {
    const projectNames = (memberships ?? [])
      .filter((m) => m.user_id === profile.id)
      .map((m) => (m.projects as unknown as { name: string } | null)?.name)
      .filter((name): name is string => Boolean(name));

    const activeBugs = (bugs ?? []).filter(
      (b) => b.assignee_id === profile.id && (b.status === "open" || b.status === "in_progress"),
    ).length;

    return { ...profile, projectNames, activeBugs };
  });

  return { users, totalCount: count ?? 0 };
}

export async function getUser(id: string): Promise<(Profile & { projectIds: string[] }) | null> {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !profile) return null;

  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", id);

  return { ...profile, projectIds: (memberships ?? []).map((m) => m.project_id) };
}

export async function getAssignableUsers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("status", "active")
    .neq("role", "viewer")
    .order("full_name");
  return data ?? [];
}

type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: Profile["role"];
  status: Profile["status"];
  projectIds: string[] | "all";
};

export async function createUserAccount(input: CreateUserInput) {
  await assertCallerIsAdmin();

  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    return { error: authError?.message ?? "Couldn't create account." };
  }

  const userId = authData.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: input.name,
    email: input.email,
    role: input.role,
    status: input.status,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: "Couldn't save the user's profile." };
  }

  if (input.projectIds !== "all" && input.projectIds.length > 0) {
    await admin
      .from("project_members")
      .insert(input.projectIds.map((project_id) => ({ project_id, user_id: userId })));
  }

  return { error: null };
}

type UpdateUserInput = {
  id: string;
  name: string;
  password?: string;
  role: Profile["role"];
  status: Profile["status"];
  projectIds: string[] | "all";
};

export async function updateUserAccount(input: UpdateUserInput) {
  await assertCallerIsAdmin();

  const admin = createAdminClient();

  if (input.password) {
    const { error } = await admin.auth.admin.updateUserById(input.id, { password: input.password });
    if (error) return { error: "Couldn't update password." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: input.name, role: input.role, status: input.status })
    .eq("id", input.id);
  if (profileError) return { error: "Couldn't update profile." };

  await admin.from("project_members").delete().eq("user_id", input.id);
  if (input.projectIds !== "all" && input.projectIds.length > 0) {
    await admin
      .from("project_members")
      .insert(input.projectIds.map((project_id) => ({ project_id, user_id: input.id })));
  }

  return { error: null };
}
