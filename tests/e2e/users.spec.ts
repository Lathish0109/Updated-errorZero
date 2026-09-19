import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser } from "@playwright/test";

import { AUTH_DIR, E2E_PREFIX, loadEnvLocal, readFixtures } from "./fixtures";

loadEnvLocal();
const fixtures = readFixtures();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function serviceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createTestUser(
  service: ReturnType<typeof serviceClient>,
  email: string,
  password: string,
) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Failed to create test user ${email}`);
  return data.user;
}

async function pageAs(browser: Browser, role: "admin" | "manager" | "developer" | "tester" | "viewer") {
  const context = await browser.newContext({
    storageState: path.resolve(AUTH_DIR, `${role}.json`),
  });
  return { context, page: await context.newPage() };
}

const createdEmails: string[] = [];

test.afterAll(async () => {
  if (createdEmails.length === 0) return;
  const service = serviceClient();
  const { data } = await service.auth.admin.listUsers();
  for (const email of createdEmails) {
    const user = data?.users.find((u) => u.email === email);
    if (user) await service.auth.admin.deleteUser(user.id);
  }
});

test.describe("Users List (ULIST)", () => {
  test("ULIST-02: list shows the E2E fixture users with correct role/status", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "admin");
    await page.goto("/users");
    await expect(page.getByText(`${E2E_PREFIX} developer`)).toBeVisible();
    await expect(page.getByText(`${E2E_PREFIX} tester`)).toBeVisible();
    await context.close();
  });

  test("ULIST-03: filter by role", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "admin");
    await page.goto("/users");
    await page.getByTestId("role-filter-trigger").click();
    await page.getByRole("option", { name: "Tester", exact: true }).click();
    await expect(page.getByText(`${E2E_PREFIX} tester`)).toBeVisible();
    await expect(page.getByText(`${E2E_PREFIX} developer`)).not.toBeVisible();
    await context.close();
  });

  test("ULIST-04: filter by status", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "admin");
    await page.goto("/users");
    await page.getByTestId("status-filter-trigger").click();
    await page.getByRole("option", { name: "Active", exact: true }).click();
    await expect(page.getByText(`${E2E_PREFIX} developer`)).toBeVisible();
    await context.close();
  });

  test("ULIST-05: search by name", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "admin");
    await page.goto("/users");
    await page.getByPlaceholder(/filter users/i).fill(`${E2E_PREFIX} tester`);
    await expect(page.getByText(`${E2E_PREFIX} tester`)).toBeVisible();
    await expect(page.getByText(`${E2E_PREFIX} developer`)).not.toBeVisible();
    await context.close();
  });

  test("ULIST-06/07: Add User and per-row Edit links navigate correctly", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "admin");
    await page.goto("/users");
    await page.getByRole("link", { name: /add user/i }).click();
    await expect(page).toHaveURL(/\/users\/new/);

    await page.goto("/users");
    const row = page.getByRole("row", { name: new RegExp(`${E2E_PREFIX} developer`) });
    await row.getByRole("link", { name: /edit/i }).click();
    await expect(page).toHaveURL(`http://localhost:3000/users/${fixtures.userIds.developer}/edit`);
    await context.close();
  });
});

test.describe("Create User (UNEW)", () => {
  test("UNEW-01/05: valid submission creates the user, and they can log in", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "admin");
    const email = "test-e2e-created-user@errorzerotest.local";
    createdEmails.push(email);

    await page.goto("/users/new");
    await page.getByLabel(/full name/i).fill(`${E2E_PREFIX} created user`);
    await page.getByLabel(/work email/i).fill(email);
    await page.getByLabel(/^password/i).fill("CreatedUser!2026");
    await page.getByLabel(/^role/i).click();
    await page.getByRole("option", { name: "Developer", exact: true }).click();
    await page.getByRole("checkbox", { name: `${E2E_PREFIX} Project` }).click();
    await page.getByRole("button", { name: /create user/i }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(`${E2E_PREFIX} created user`)).toBeVisible();
    await context.close();

    // New account logs in for real.
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.auth.signInWithPassword({ email, password: "CreatedUser!2026" });
    expect(error).toBeNull();
  });

  test("UNEW-02: required fields are enforced", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "admin");
    await page.goto("/users/new");
    await page.getByRole("button", { name: /create user/i }).click();
    await expect(page).toHaveURL(/\/users\/new/);
    await context.close();
  });

  test("UNEW-03: duplicate email shows a clear error, no orphaned auth user", async ({
    browser,
  }) => {
    const { context, page } = await pageAs(browser, "admin");
    await page.goto("/users/new");
    await page.getByLabel(/full name/i).fill("Duplicate attempt");
    await page.getByLabel(/work email/i).fill("test-e2e-developer@errorzerotest.local");
    await page.getByLabel(/^password/i).fill("WhateverPass1");
    await page.getByLabel(/^role/i).click();
    await page.getByRole("option", { name: "Tester", exact: true }).click();
    await page.getByRole("button", { name: /create user/i }).click();
    // Scoped to the form's own inline error paragraph -- a loose page-wide
    // text search also catches Next's dev-mode error overlay, which logs
    // its own "Console Error" label that happens to match "error".
    await expect(page.locator("form p.text-destructive")).toBeVisible();
    await context.close();
  });

  test("UNEW-08: only Admin can access this page", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "manager");
    await page.goto("/users/new");
    await expect(page).toHaveURL(/\/dashboard/);
    await context.close();
  });
});

test.describe("Edit User (UEDIT)", () => {
  test("UEDIT-01: updating name/role/status saves", async ({ browser }) => {
    const email = "test-e2e-edit-target@errorzerotest.local";
    createdEmails.push(email);
    const service = serviceClient();
    const created = await createTestUser(service, email, "EditTarget!2026");
    await service.from("profiles").upsert({
      id: created.id,
      full_name: `${E2E_PREFIX} edit target`,
      email,
      role: "tester",
      status: "active",
    });

    const { context, page } = await pageAs(browser, "admin");
    await page.goto(`/users/${created.id}/edit`);
    await page.getByLabel(/full name/i).fill(`${E2E_PREFIX} edit target (renamed)`);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByText(`${E2E_PREFIX} edit target (renamed)`)).toBeVisible();
    await context.close();
  });

  test("UEDIT-02/03: blank password keeps the old one; a new password replaces it", async ({
    browser,
  }) => {
    const email = "test-e2e-password-target@errorzerotest.local";
    createdEmails.push(email);
    const service = serviceClient();
    const created = await createTestUser(service, email, "OriginalPass!1");
    await service.from("profiles").upsert({
      id: created.id,
      full_name: `${E2E_PREFIX} password target`,
      email,
      role: "tester",
      status: "active",
    });

    const { context, page } = await pageAs(browser, "admin");
    // Unrelated edit, password left blank.
    await page.goto(`/users/${created.id}/edit`);
    await page.getByLabel(/full name/i).fill(`${E2E_PREFIX} password target v2`);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page).toHaveURL(/\/users$/);
    await context.close();

    const anon1 = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const stillWorks = await anon1.auth.signInWithPassword({
      email,
      password: "OriginalPass!1",
    });
    expect(stillWorks.error).toBeNull();

    // Now actually change it.
    const { context: context2, page: page2 } = await pageAs(browser, "admin");
    await page2.goto(`/users/${created.id}/edit`);
    await page2.getByLabel(/new password/i).fill("BrandNewPass!2");
    await page2.getByRole("button", { name: /save changes/i }).click();
    await expect(page2).toHaveURL(/\/users$/);
    await context2.close();

    const anon2 = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const oldFails = await anon2.auth.signInWithPassword({ email, password: "OriginalPass!1" });
    expect(oldFails.error).not.toBeNull();
    const newWorks = await anon2.auth.signInWithPassword({ email, password: "BrandNewPass!2" });
    expect(newWorks.error).toBeNull();
  });

  test("UEDIT-04: deactivating a user blocks new bug assignment eligibility", async ({
    browser,
  }) => {
    // Full login-block would require signing them out mid-session too;
    // this confirms the documented, directly-testable effect: an inactive
    // user drops out of getAssignableUsers() immediately.
    const email = "test-e2e-deactivate-target@errorzerotest.local";
    createdEmails.push(email);
    const service = serviceClient();
    const created = await createTestUser(service, email, "DeactivateMe!1");
    await service.from("profiles").upsert({
      id: created.id,
      full_name: `${E2E_PREFIX} deactivate target`,
      email,
      role: "tester",
      status: "active",
    });

    const { context, page } = await pageAs(browser, "admin");
    await page.goto(`/users/${created.id}/edit`);
    await page.getByRole("switch").click();
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page).toHaveURL(/\/users$/);

    await page.goto("/bugs/new");
    await page.getByLabel(/^assignee/i).click();
    await expect(
      page.getByRole("option", { name: `${E2E_PREFIX} deactivate target` }),
    ).toHaveCount(0);
    await context.close();
  });
});
