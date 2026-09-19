// Shared constants + env loading for the E2E suite. Kept separate from
// global-setup.ts so spec files can import the fixture IDs/paths without
// pulling in the (Node-only) setup logic itself.

import { readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvLocal() {
  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // assume already in env
  }
}

export const AUTH_DIR = path.resolve(process.cwd(), "tests/e2e/.auth");
export const FIXTURES_FILE = path.resolve(AUTH_DIR, "fixtures.json");

export const E2E_PREFIX = "TEST_E2E";
export const E2E_PROJECT_KEY = "TE2E";
export const E2E_USER_PASSWORD = "E2eTest!2026x";

export const E2E_USER_DEFS = {
  manager: { email: "test-e2e-manager@errorzerotest.local", role: "manager" as const },
  developer: { email: "test-e2e-developer@errorzerotest.local", role: "developer" as const },
  tester: { email: "test-e2e-tester@errorzerotest.local", role: "tester" as const },
  viewer: { email: "test-e2e-viewer@errorzerotest.local", role: "viewer" as const },
};

export type E2eUserKey = keyof typeof E2E_USER_DEFS;

export type E2eFixtures = {
  projectId: string;
  userIds: Record<E2eUserKey, string>;
  userNames: Record<E2eUserKey, string>;
};

export function readFixtures(): E2eFixtures {
  return JSON.parse(readFileSync(FIXTURES_FILE, "utf8"));
}
