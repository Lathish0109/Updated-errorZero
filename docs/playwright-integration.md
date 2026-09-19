# Connecting a Playwright project to ErrorZero

This lets an external Playwright test suite -- running in any IDE, or in CI --
file a bug directly into a project as soon as a human or a test author has
*confirmed* it's a real defect (not on every red test, which would flood the
tracker with flaky-test noise).

## 1. Generate an API key

In ErrorZero: **Settings → API Keys → Generate New Key** (admin only).
Give it a name (e.g. `"Playwright CI"`) and pick the one project it reports
into -- each key is scoped to exactly one project. Copy the key immediately;
it's shown only once and stored elsewhere only as a hash.

Store it as a secret in your Playwright project's environment
(`ERRORZERO_API_KEY`), never committed to source control.

## 2. Add a reporting helper

```ts
// reportBug.ts
type Severity = "critical" | "high" | "medium" | "low";
type Priority = "p1" | "p2" | "p3" | "p4";

export async function reportBug(bug: {
  title: string;
  stepsToReproduce: string;
  severity?: Severity;
  priority?: Priority;
  expectedResult?: string;
  actualResult?: string;
  additionalContext?: string;
}) {
  const res = await fetch(`${process.env.ERRORZERO_BASE_URL}/api/v1/bugs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ERRORZERO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: bug.title,
      steps_to_reproduce: bug.stepsToReproduce,
      severity: bug.severity,
      priority: bug.priority,
      expected_result: bug.expectedResult,
      actual_result: bug.actualResult,
      additional_context: bug.additionalContext,
    }),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Failed to report bug to ErrorZero: ${error}`);
  }

  return res.json() as Promise<{ id: string; displayId: string }>;
}
```

## 3. Call it only on a *confirmed* defect

Don't call `reportBug()` from a generic `afterEach` on every failure --
that's exactly the noise this integration is designed to avoid. Call it from
the place in your suite where a failure has been deliberately classified as
a real bug, for example a custom assertion helper or a triage step:

```ts
import { test, expect } from "@playwright/test";
import { reportBug } from "./reportBug";

test("checkout button is disabled after adding an out-of-stock item", async ({ page }) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: "Add out-of-stock item" }).click();

  const checkoutButton = page.getByRole("button", { name: "Checkout" });
  const isDisabled = await checkoutButton.isDisabled();

  if (!isDisabled) {
    await reportBug({
      title: "Checkout button stays enabled after adding an out-of-stock item",
      stepsToReproduce:
        "1. Go to /cart\n2. Add an out-of-stock item\n3. Observe the Checkout button",
      severity: "high",
      expectedResult: "Checkout button should be disabled.",
      actualResult: "Checkout button remains enabled, allowing checkout of unavailable stock.",
    });
  }

  expect(isDisabled).toBe(true);
});
```

## Request / response reference

`POST /api/v1/bugs`

Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`

Body:

| field                 | required | notes                                             |
| --------------------- | -------- | -------------------------------------------------- |
| `title`                | yes      |                                                     |
| `steps_to_reproduce`   | yes      |                                                     |
| `severity`             | no       | `critical` \| `high` \| `medium` \| `low` (default `medium`) |
| `priority`             | no       | `p1` \| `p2` \| `p3` \| `p4` (default `p3`)        |
| `expected_result`      | no       |                                                     |
| `actual_result`        | no       |                                                     |
| `additional_context`   | no       | e.g. a trace/screenshot URL, browser, env          |

Responses:

- `201` -- `{ "id": "...", "displayId": "SP001-5" }`
- `400` -- missing/invalid field, e.g. `{ "error": "\`title\` is required." }`
- `401` -- missing, invalid, or revoked key, e.g. `{ "error": "This API key has been revoked." }`

Bugs filed this way are attributed to a shared **Automation** account and
tagged with source `automation`, so they're visually distinguishable from
manually-reported bugs everywhere in the UI.
