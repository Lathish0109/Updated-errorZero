import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser } from "@playwright/test";

import { AUTH_DIR, E2E_PREFIX, E2E_USER_DEFS, E2E_USER_PASSWORD, loadEnvLocal } from "./fixtures";

loadEnvLocal();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function serviceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function pageAs(browser: Browser, role: "admin" | "manager" | "developer" | "tester" | "viewer") {
  const context = await browser.newContext({
    storageState: path.resolve(AUTH_DIR, `${role}.json`),
  });
  return { context, page: await context.newPage() };
}

test.describe("Settings (SETTINGS)", () => {
  test("SETTINGS-01: every role, including Viewer, can reach and use this screen", async ({
    browser,
  }) => {
    const { context, page } = await pageAs(browser, "viewer");
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Bug assigned to me")).toBeVisible();
    await context.close();
  });

  test("SETTINGS-02/03/04: toggling a preference saves, persists, and is per-user", async ({
    browser,
  }) => {
    const { context, page } = await pageAs(browser, "tester");
    await page.goto("/settings");

    const checkbox = page.getByRole("checkbox", { name: "Bug status changed" });
    const wasChecked = await checkbox.isChecked();
    await checkbox.click();
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Bug status changed" })).toBeChecked({
      checked: !wasChecked,
    });

    // Another role's preferences are untouched.
    const { context: devContext, page: devPage } = await pageAs(browser, "developer");
    await devPage.goto("/settings");
    await expect(devPage.getByRole("checkbox", { name: "Bug status changed" })).toBeChecked();
    await devContext.close();

    // Revert so this spec is safe to re-run.
    await checkbox.click();
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await context.close();
  });
});

test.describe("Profile (PROFILE)", () => {
  test("PROFILE-01: updating the display name saves and shows in the topbar", async ({
    browser,
  }) => {
    const { context, page } = await pageAs(browser, "tester");
    await page.goto("/profile");
    const newName = `${E2E_PREFIX} tester renamed`;
    await page.getByLabel(/full name/i).fill(newName);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();
    await expect(page.getByRole("button", { name: /account menu/i })).toBeVisible();

    // Revert.
    await page.getByLabel(/full name/i).fill(`${E2E_PREFIX} tester`);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();
    await context.close();
  });

  test("PROFILE-02: resetting your own password with the correct current password works", async ({
    browser,
  }) => {
    const email = "test-e2e-profile-target@errorzerotest.local";
    const service = serviceClient();
    const { data: existing } = await service.auth.admin.listUsers();
    const stale = existing?.users.find((u) => u.email === email);
    if (stale) await service.auth.admin.deleteUser(stale.id);

    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password: "StartingPass!1",
      email_confirm: true,
    });
    if (error || !created.user) throw error ?? new Error("failed to create profile-reset user");
    await service.from("profiles").upsert({
      id: created.user.id,
      full_name: `${E2E_PREFIX} profile target`,
      email,
      role: "tester",
      status: "active",
    });

    const anonLogin = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await anonLogin.auth.signInWithPassword({ email, password: "StartingPass!1" });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill(email);
    await page.getByLabel(/^password$/i).fill("StartingPass!1");
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/profile");
    await page.getByLabel(/current password/i).fill("StartingPass!1");
    await page.getByLabel(/^new password/i).fill("BrandNewPass!2");
    await page.getByLabel(/confirm new password/i).fill("BrandNewPass!2");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByText("Password updated")).toBeVisible();
    await context.close();

    const anon2 = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const oldFails = await anon2.auth.signInWithPassword({ email, password: "StartingPass!1" });
    expect(oldFails.error).not.toBeNull();
    const newWorks = await anon2.auth.signInWithPassword({ email, password: "BrandNewPass!2" });
    expect(newWorks.error).toBeNull();

    await service.auth.admin.deleteUser(created.user.id);
  });

  test("PROFILE-04: logout ends the session from anywhere in the app", async ({ browser }) => {
    // A fresh sign-in via the login form, not the shared tester.json
    // storageState -- signOut() revokes the session's refresh token, and
    // reusing the shared fixture session here would break every other spec
    // that still expects tester.json to be valid.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill(E2E_USER_DEFS.tester.email);
    await page.getByLabel(/^password$/i).fill(E2E_USER_PASSWORD);
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/reports");
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
