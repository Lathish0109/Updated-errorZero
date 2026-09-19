"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

const KEYWORDS = new Set([
  "import",
  "export",
  "default",
  "const",
  "let",
  "var",
  "function",
  "async",
  "await",
  "return",
  "if",
  "else",
  "type",
  "interface",
  "from",
  "new",
  "typeof",
  "extends",
  "test",
  "expect",
  "throw",
  "try",
  "catch",
  "true",
  "false",
  "null",
  "undefined",
  "void",
]);

// Comments, strings, and bare words -- good enough for the short JS/TS/bash
// snippets on this page. Not a real tokenizer; don't reach for this to
// highlight arbitrary source files.
const TOKEN_PATTERN = /(\/\/[^\n]*|#[^\n]*)|(`[^`]*`|"[^"]*"|'[^']*')|([A-Za-z_$][\w$]*)/g;

function highlight(code: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = TOKEN_PATTERN.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{code.slice(lastIndex, match.index)}</Fragment>);
    }
    const [full, comment, string, word] = match;
    if (comment) {
      nodes.push(
        <span key={key++} className="text-slate-500">
          {comment}
        </span>,
      );
    } else if (string) {
      nodes.push(
        <span key={key++} className="text-lime-400">
          {string}
        </span>,
      );
    } else if (word && KEYWORDS.has(word)) {
      nodes.push(
        <span key={key++} className="text-cyan-400">
          {word}
        </span>,
      );
    } else {
      nodes.push(<Fragment key={key++}>{full}</Fragment>);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < code.length) {
    nodes.push(<Fragment key={key++}>{code.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative rounded-md border border-[#1c2c52] bg-[#0a1128]">
      <div className="flex items-center justify-between border-b border-[#1c2c52] px-3 py-1.5">
        <span className="text-xs font-medium text-slate-400">{language ?? "code"}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Copy code"
          onClick={handleCopy}
        >
          {copied ? <Check className="text-emerald-400" /> : <Copy className="text-slate-400" />}
        </Button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-xs leading-relaxed text-slate-200">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}

const REPORT_HELPER_CODE = `// reportBug.ts
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
  const res = await fetch(\`\${process.env.ERRORZERO_BASE_URL}/api/v1/bugs\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.ERRORZERO_API_KEY}\`,
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
    throw new Error(\`Failed to report bug to ErrorZero: \${error}\`);
  }

  return res.json() as Promise<{ id: string; displayId: string }>;
}`;

const TEST_USAGE_CODE = `import { test, expect } from "@playwright/test";
import { reportBug } from "./reportBug";

test("checkout button is disabled after adding an out-of-stock item", async ({ page }) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: "Add out-of-stock item" }).click();

  const checkoutButton = page.getByRole("button", { name: "Checkout" });
  const isDisabled = await checkoutButton.isDisabled();

  // Only file a bug once the failure is confirmed as a real defect --
  // never call reportBug() from a blanket afterEach on every red test,
  // or every flaky failure floods the tracker.
  if (!isDisabled) {
    await reportBug({
      title: "Checkout button stays enabled after adding an out-of-stock item",
      stepsToReproduce:
        "1. Go to /cart\\n2. Add an out-of-stock item\\n3. Observe the Checkout button",
      severity: "high",
      expectedResult: "Checkout button should be disabled.",
      actualResult: "Checkout button remains enabled, allowing checkout of unavailable stock.",
    });
  }

  expect(isDisabled).toBe(true);
});`;

const ENV_CODE = `# .env (Playwright project, never committed)
ERRORZERO_BASE_URL=https://your-errorzero-deployment.example.com
ERRORZERO_API_KEY=ezt_live_...`;

const FIELDS: { field: string; required: boolean; notes: string }[] = [
  { field: "title", required: true, notes: "" },
  { field: "steps_to_reproduce", required: true, notes: "" },
  { field: "severity", required: false, notes: "critical | high | medium | low (default medium)" },
  { field: "priority", required: false, notes: "p1 | p2 | p3 | p4 (default p3)" },
  { field: "expected_result", required: false, notes: "" },
  { field: "actual_result", required: false, notes: "" },
  { field: "additional_context", required: false, notes: "e.g. a trace/screenshot URL, browser, env" },
];

export function ApiIntegrationGuide() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">How it works</h2>
        <p className="text-muted-foreground text-sm">
          Generate a key above, scoped to one project. An external Playwright suite -- running
          in any IDE or CI -- calls <code className="bg-muted rounded px-1 py-0.5 text-xs">POST /api/v1/bugs</code>{" "}
          with that key once a test has explicitly confirmed a real defect. The bug is filed
          under a shared <span className="font-medium">Automation</span> account, tagged with
          source <code className="bg-muted rounded px-1 py-0.5 text-xs">automation</code>, and
          shows up in the tracker exactly like any manually-reported bug.
        </p>
        <p className="text-muted-foreground text-sm">
          Don&apos;t call this from a blanket <code className="bg-muted rounded px-1 py-0.5 text-xs">afterEach</code> on
          every failing test -- that floods the tracker with flaky-test noise. Call it only from
          the place in your suite where a failure has been deliberately classified as a bug.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">1. Set environment variables</h2>
        <p className="text-muted-foreground text-sm">
          In your Playwright project, store the base URL and the key you generated above as
          secrets.
        </p>
        <CodeBlock code={ENV_CODE} language="bash" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">2. Add a reporting helper</h2>
        <CodeBlock code={REPORT_HELPER_CODE} language="reportBug.ts" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">3. Call it on a confirmed defect</h2>
        <CodeBlock code={TEST_USAGE_CODE} language="checkout.spec.ts" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Request / response reference</h2>
        <div className="text-muted-foreground text-sm">
          <p>
            <code className="bg-muted rounded px-1 py-0.5 text-xs">POST /api/v1/bugs</code>
            {" "}-- headers:{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">Authorization: Bearer &lt;key&gt;</code>,{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">Content-Type: application/json</code>
          </p>
        </div>
        <div className="border-border overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">Required</th>
                <th className="px-4 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((f) => (
                <tr key={f.field} className="border-border border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{f.field}</td>
                  <td className="px-4 py-2 text-xs">{f.required ? "Yes" : "No"}</td>
                  <td className="text-muted-foreground px-4 py-2 text-xs">{f.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>
            <code className="bg-muted rounded px-1 py-0.5 text-xs">201</code> --{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">{`{ "id": "...", "displayId": "SP001-5" }`}</code>
          </li>
          <li>
            <code className="bg-muted rounded px-1 py-0.5 text-xs">400</code> -- missing/invalid
            field, e.g.{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">{`{ "error": "\`title\` is required." }`}</code>
          </li>
          <li>
            <code className="bg-muted rounded px-1 py-0.5 text-xs">401</code> -- missing,
            invalid, or revoked key, e.g.{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              {`{ "error": "This API key has been revoked." }`}
            </code>
          </li>
        </ul>
      </section>
    </div>
  );
}
