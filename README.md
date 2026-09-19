# ErrorZero

Bug tracking and issue management for software teams, built with Next.js and
Supabase.

## Getting started

1. Copy `.env.example` to `.env.local` and fill in your Supabase project's
   URL, anon key, and service role key.
2. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

3. Seed the permanent admin account (there is no public signup -- see
   "Authentication model" below):

   ```bash
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... ADMIN_NAME="Your Name" \
     node scripts/seed-admin.mjs
   ```

4. Optionally seed the shared automation bot account used by the API
   integration (**Settings → API Keys**, see
   [docs/playwright-integration.md](docs/playwright-integration.md)):

   ```bash
   node scripts/seed-automation-bot.mjs
   ```

## Authentication model

There is no self-service signup and no forgot-password flow. One permanent
admin account (seeded above) creates every other user, with a role, from the
Users screen. Keep this in mind if you're extending auth-related code.

## Scripts

| Command               | What it does                                          |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`           | Start the dev server                                    |
| `npm run build`         | Production build                                        |
| `npm run start`         | Run a production build                                  |
| `npm run lint`          | ESLint                                                   |
| `npm run typecheck`     | Generate route types and run `tsc --noEmit`              |
| `npm run format`        | Format with Prettier                                     |
| `npm run test`          | Unit tests (Vitest)                                      |
| `npm run test:rls`      | Row-Level-Security policy tests against the live Supabase project -- needs `ADMIN_EMAIL`/`ADMIN_PASSWORD` passed at invocation |
| `npm run test:e2e`      | End-to-end tests (Playwright) -- same admin credentials required |
| `node scripts/cleanup-test-data.mjs` | Safety-net sweep for test data left behind by a crashed RLS/E2E run |

## Deployment

Deployed on Vercel. `vercel --prod` builds and publishes the current branch;
the project's environment variables (same as `.env.local`) are configured in
the Vercel dashboard.
