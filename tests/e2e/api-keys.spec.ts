// Layer 3: the Automation API admin screen (/settings/api-keys) -- generate
// a key, confirm it's revealed exactly once then masked, revoke it, and
// confirm the page is admin-only. See tests/e2e/fixtures.ts for the shared
// per-role storage states this suite signs in with.

import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser } from "@playwright/test";

import { AUTH_DIR, E2E_PREFIX, loadEnvLocal } from "./fixtures";

loadEnvLocal();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PROJECT_NAME = `${E2E_PREFIX} Project`;

function serviceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function pageAs(
  browser: Browser,
  role: "admin" | "manager" | "developer" | "tester" | "viewer",
) {
  const context = await browser.newContext({
    storageState: path.resolve(AUTH_DIR, `${role}.json`),
  });
  return { context, page: await context.newPage() };
}

async function generateKey(page: Awaited<ReturnType<Browser["newPage"]>>, keyName: string) {
  await page.goto("/settings/api-keys");
  await page.getByRole("button", { name: /generate new key/i }).click();
  await page.getByLabel("Name").fill(keyName);
  await page.locator("#key-project").click();
  await page.getByRole("option", { name: PROJECT_NAME }).click();
  await page.getByRole("button", { name: "Create Key" }).click();
  await expect(page.getByText("Your new API key")).toBeVisible();
}

const createdKeyNames: string[] = [];

test.afterAll(async () => {
  if (createdKeyNames.length === 0) return;
  const service = serviceClient();
  await service.from("api_keys").delete().in("name", createdKeyNames);
});

test.describe("Automation API keys (AKEY)", () => {
  test("AKEY-01: only Admin can access the Automation API page", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "manager");
    await page.goto("/settings/api-keys");
    await expect(page).toHaveURL(/\/settings$/);
    await context.close();
  });

  test("AKEY-02: viewer is also blocked", async ({ browser }) => {
    const { context, page } = await pageAs(browser, "viewer");
    await page.goto("/settings/api-keys");
    await expect(page).toHaveURL(/\/settings$/);
    await context.close();
  });

  test("AKEY-03: Admin generates a key, it's revealed exactly once, then masked in the table", async ({
    browser,
  }) => {
    const keyName = `${E2E_PREFIX} generate test`;
    createdKeyNames.push(keyName);

    const { context, page } = await pageAs(browser, "admin");
    await generateKey(page, keyName);

    const revealedKey = (await page.getByTestId("revealed-api-key").textContent())?.trim();
    expect(revealedKey).toMatch(/^ez_live_/);

    await page.getByRole("button", { name: /i've copied it/i }).click();
    await expect(page.getByText("Your new API key")).not.toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(keyName) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Active")).toBeVisible();
    // The full plaintext key must never appear again outside the one-time
    // reveal box -- only the short, non-secret prefix is shown in the table.
    await expect(row).not.toContainText(revealedKey!);

    await context.close();
  });

  test("AKEY-04: revoking a key marks it Revoked and removes its revoke action", async ({
    browser,
  }) => {
    const keyName = `${E2E_PREFIX} revoke test`;
    createdKeyNames.push(keyName);

    const { context, page } = await pageAs(browser, "admin");
    await generateKey(page, keyName);
    await page.getByRole("button", { name: /i've copied it/i }).click();

    const row = page.getByRole("row", { name: new RegExp(keyName) });
    await expect(row.getByText("Active")).toBeVisible();

    await row.getByRole("button", { name: `Revoke ${keyName}` }).click();
    await expect(row.getByText("Revoked")).toBeVisible();
    await expect(row.getByRole("button", { name: `Revoke ${keyName}` })).toHaveCount(0);

    await context.close();
  });

  test("AKEY-05: a revoked key is rejected by the external /api/v1/bugs endpoint", async ({
    browser,
    request,
  }) => {
    const keyName = `${E2E_PREFIX} revoked-rejected test`;
    createdKeyNames.push(keyName);

    const { context, page } = await pageAs(browser, "admin");
    await generateKey(page, keyName);
    const revealedKey = (await page.getByTestId("revealed-api-key").textContent())!.trim();
    await page.getByRole("button", { name: /i've copied it/i }).click();

    const row = page.getByRole("row", { name: new RegExp(keyName) });
    await row.getByRole("button", { name: `Revoke ${keyName}` }).click();
    await expect(row.getByText("Revoked")).toBeVisible();
    await context.close();

    const res = await request.post("/api/v1/bugs", {
      headers: { Authorization: `Bearer ${revealedKey}` },
      data: { title: "Should be rejected", steps_to_reproduce: "n/a" },
    });
    expect(res.status()).toBe(401);
  });
});
