import { expect, test } from "@playwright/test";

import { E2E_USER_DEFS, E2E_USER_PASSWORD, loadEnvLocal } from "./fixtures";

loadEnvLocal();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

// Runs with a fresh, signed-out context (no storageState) -- this is the one
// spec that needs to drive the actual login form itself.
test.describe("Login", () => {
  test("correct credentials land on the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
  });

  test("wrong password shows an inline error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill("definitely-wrong-password");
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  // LOGIN-02: every role, not just admin, can actually sign in.
  for (const [role, def] of Object.entries(E2E_USER_DEFS)) {
    test(`${role} credentials land on the dashboard`, async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/work email/i).fill(def.email);
      await page.getByLabel(/^password$/i).fill(E2E_USER_PASSWORD);
      await page.getByRole("button", { name: /login/i }).click();
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
    });
  }

  test("non-existent email gives the same generic error (no user enumeration)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill("nobody-at-all@errorzerotest.local");
    await page.getByLabel(/^password$/i).fill("whatever-password");
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("empty email and password are blocked by required-field validation", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /login/i }).click();
    // Native HTML5 validation blocks the submit -- we never leave /login or
    // reach a server error.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid email or password/i)).not.toBeVisible();
  });

  test("malformed email is blocked by the browser's own validation", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill("not-an-email");
    await page.getByLabel(/^password$/i).fill("whatever-password");
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid email or password/i)).not.toBeVisible();
  });

  test("script injection in the email field is treated as a literal invalid value", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill('<script>window.__xss=1</script>@x.com');
    await page.getByLabel(/^password$/i).fill("whatever-password");
    await page.getByRole("button", { name: /login/i }).click();
    const xssRan = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
    expect(xssRan).toBeUndefined();
    await expect(page).toHaveURL(/\/login/);
  });

  test("already-authenticated user visiting /login is redirected to /dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("Unauthenticated access", () => {
  test("visiting a protected route with no session redirects to /login", async ({ browser }) => {
    const context = await browser.newContext(); // no storageState -- signed out
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("session persists across a hard refresh", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
  });
});
