// Seeds the "Automation" system account -- the Reporter every bug filed
// through the external API (app/api/v1/bugs) is attributed to. It's a real
// profile (shows up in the UI like any teammate) backed by a real auth user
// with a password nobody is ever given; nobody signs in as it.
//
// Usage:
//   node scripts/seed-automation-bot.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local. Safe to re-run: it upserts rather than erroring on a repeat.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // .env.local not present -- assume vars are already in the environment.
  }
}

loadEnvLocal();

const BOT_EMAIL = "automation@errorzerotracker.local";
const BOT_NAME = "Automation";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: existing } = await supabase.auth.admin.listUsers();
  let userId = existing?.users.find((u) => u.email === BOT_EMAIL)?.id;

  if (userId) {
    console.log(`Auth user already exists for ${BOT_EMAIL}, reusing it.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: BOT_EMAIL,
      password: randomBytes(24).toString("base64url"), // never shared, never logged in with
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created auth user ${BOT_EMAIL}.`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: BOT_NAME,
    email: BOT_EMAIL,
    role: "tester",
    status: "active",
  });
  if (profileError) throw profileError;

  console.log(`Automation bot profile ready. Profile id: ${userId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
