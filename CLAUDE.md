# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace layout

The working directory `quantive/` is a container, **not** a git repo. The code lives in nested repos:

- **`quantive-app/`** — the product (its own git repo). This is where ~all coding happens. Run every command below from here.
- **`quantive-internal/`** — founder-internal docs and skills (separate git repo). Never reference it from anything inside `quantive-app/` — that repo is public; inline the substance instead.
- `.design-reference/`, `supabase/` (root), `node_modules/` (root) — scratch/reference; ignore unless a task points you there.

## Commands

All run from `quantive-app/`:

```sh
npm run dev            # Vite dev server on http://localhost:8080 (note: 8080, not 5173)
npm run build          # production build
npm run typecheck      # tsc -b
npm run lint           # ESLint — 0 errors required
npm run test           # Vitest (unit). ~20s: crypto tests use real Argon2id params, so they're slow by design
npm run test:watch     # Vitest watch
npm run test:e2e       # Playwright (headless). Auto-starts the dev server via webServer config
npm run test:all       # unit + E2E
npm run size:check     # size-limit bundle budget (enforced; see package.json `size-limit`)
```

Run a single unit test: `npx vitest run src/lib/forecast.test.ts` (or `-t "name"` to filter by title).
Run a single E2E spec: `npx playwright test e2e/auth.spec.ts`. The two Family specs (`rls-portfolios`, `family-sharing`) run in their own `family` project, after every other spec and on one worker: they make test user 1 a partner in test user 2's portfolio, and each resets both users. Run them with `npx playwright test --project=family --no-deps`; without `--no-deps` Playwright runs the whole suite first.

**E2E auth:** Supabase enforces Turnstile CAPTCHA on password sign-in with the real production secret, so headless tests can't submit the `AuthModal` form. Instead [e2e/global-setup.ts](e2e/global-setup.ts) mints one session per test user via the service-role `admin.generateLink` + `verifyOtp` path (see `prepareSessions` in [e2e/helpers/auth.ts](e2e/helpers/auth.ts)), and specs inject it before driving the real unlock UI. Needs `SUPABASE_SERVICE_ROLE_KEY` and `TEST_USER_*` in `.env` (see `.env.example`); without them the auth specs skip. Don't set `VITE_TURNSTILE_SITE_KEY` to Cloudflare's always-pass test key: the real secret rejects its token.

The four merge gates are `lint`, `typecheck`, `test`, `build`. `.husky/pre-commit` runs lint + typecheck + `stamp:freshness`; `.husky/pre-push` runs the full `test:all` + build + `size:check`. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) mirrors the gates but **skips E2E** and never deploys — keep it read-only.

Deployment is owned by [.github/workflows/deploy.yml](.github/workflows/deploy.yml): it runs after CI succeeds on `main`, prerenders the public routes via headless Chromium (impossible inside Cloudflare's non-root build image), and uploads `dist/` through `wrangler pages deploy`. Cloudflare Pages is on **Direct Upload** (git integration disconnected), so this workflow is the only deploy path. Do not add a deploy step to `ci.yml`.

**Build-env invariant:** the build runs in GitHub Actions, not Cloudflare, so every `VITE_*` value the bundle reads must exist both in deploy.yml's `Build and prerender` `env:` block AND as a GitHub repo variable/secret — Vite inlines them at build time, and a missing one ships a bundle that blanks the whole site. A guard step fails the deploy if `dist/index.html` has no `<h1>`. Keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`, `VITE_POSTHOG_HOST` (variables), `VITE_POSTHOG_KEY` (secret); deploy secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`; variables `CF_PAGES_PROJECT`, `DEPLOY_ENABLED`.

Typecheck nuance: `npx tsc --noEmit -p tsconfig.app.json` is what CONTRIBUTING treats as the gate — it also checks test files.

## Architecture

React 18 + TypeScript + Vite (SWC) SPA. Supabase (Postgres + Auth + Deno edge functions) backend, Stripe billing. The `@/` alias maps to `quantive-app/src/`.

### End-to-end encryption is the load-bearing design

Portfolio data is encrypted in the browser before it ever reaches the server. The spec at [docs/security/encryption.md](docs/security/encryption.md) is the contract — treat it as authoritative, and update it (citing the section number in the PR) for any change to the crypto module, AAD framing, KDF params, or `enc_version`.

- **`src/lib/crypto/`** is pure: no I/O, no network, no React, no Supabase. It is MIT-licensed for independent audit (the rest of the repo is PolyForm Noncommercial). Keep it side-effect-free; all persistence happens in higher layers. Public surface is [src/lib/crypto/index.ts](src/lib/crypto/index.ts).
- Key model: a random 256-bit **data key (DK)** encrypts snapshots; a **KEK** derived from the password via Argon2id wraps the DK. The KEK is never stored — re-derived each login. A 24-word BIP-39 mnemonic wraps a second copy of the DK for recovery. Changing a password re-wraps the DK; it does not re-encrypt history.
- Every ciphertext carries **AAD** bound to user ID + schema version, so ciphertext can't be transplanted between rows.
- **Extra portfolios and sharing (Family plan)**: the personal portfolio stays in `portfolio_snapshots` under the DK and is never shared. Each extra portfolio has its own portfolio key (PK), wrapped under each member's DK; its blob's AAD binds the portfolio id rather than a user (encryption.md §5.2, §6.4–§6.6). An owner shares one with a single partner through `/join/<id>#k=<secret>`: the secret wraps the PK, lives only in the link, and [src/lib/inviteFragment.ts](src/lib/inviteFragment.ts) (the first import in `main.tsx`) strips it before analytics starts, so keep that import first. Writes go only through SQL functions (`save_portfolio` is a compare-and-swap on `revision`). Every edit is a pure op in [src/lib/portfolioOps.ts](src/lib/portfolioOps.ts), and [src/lib/portfolioSync.ts](src/lib/portfolioSync.ts) replays unsaved ops when a partner saved first, so a new kind of edit needs an op, not a direct `setData`. The migrations' RLS and functions are tested on an in-memory Postgres in [supabase/tests/](supabase/tests/). Hidden unless the plan grants `portfolios.multiple` (a Family subscription, or the service-role `family_beta` table; SQL's `has_family()` reads both); a partner gets Pro through `family_member`. Once Family lapses, extra portfolios stay viewable but read-only (`readOnlyReason` in PortfolioContext, which refuses every op).

### Context provider chain (the spine)

Nesting in [src/App.tsx](src/App.tsx), outer→inner: `Auth → KeySession → Currency → Preferences → Portfolio`. Each layer depends on the ones above it:

- **AuthContext** — Supabase auth session.
- **KeySessionContext** — holds KEK + DK **in refs** (not state, to avoid re-renders) for the session. Exposes a single `status` (`locked` / `unlocked-encrypted`). Zeroes keys on logout/lock/user-change.
- **PortfolioContext** — the data layer: loads/decrypts snapshots, syncs to cloud, holds the enriched portfolio. Guests keep data in `localStorage`; authed users never write plaintext portfolio data there.

**Invariant — reset on user-id transition** (encryption.md §8.6): any new `localStorage`/`sessionStorage` key, React Query cache, or in-memory store keyed to a specific user must be wiped on sign-out and account switch by the PortfolioContext watcher (or a parallel guard like [QueryCacheGuard](src/components/auth/QueryCacheGuard.tsx)). Breaking this leaks one user's data into another's session.

### Routing & shell coupling

[src/App.tsx](src/App.tsx) has three coupled lists that express different concerns but currently overlap — read the inline comments before editing:

- `APP_SHELL_PATHS` — routes that render the sidebar/topbar `AppShell`.
- `PROTECTED_PATHS` in [RequireUnlock](src/components/auth/RequireUnlock.tsx) — routes that render encrypted user data and require an unlocked key session.
- `RequireAuth` block — only `/settings` and `/admin` are auth-gated; `/dashboard`, `/forecast`, `/allocations`, `/sources` stay guest-accessible *because* they hold no user-tied cache after the watcher. If any of them caches user-tied data again, move it under `RequireAuth`.

Pages are lazy-loaded. Errors use a route-scoped boundary (resets on navigation) inside an outer `ErrorBoundary` (catches provider-init failures).

### Supabase backend

- **Migrations are forward-only** (`supabase/migrations/`): once committed a file never changes; new changes get a new timestamped file.
- **RLS on every user-data table** — a new table needs `ENABLE ROW LEVEL SECURITY` plus at least a SELECT policy keyed by `auth.uid()`.
- **Service-role key only in edge functions**, never the client bundle. If something seems to need it client-side, the answer is almost always an edge function.
- Edge functions (`supabase/functions/`, Deno) cover Stripe webhook/checkout/portal, subscription checks, FX ingest, benchmark ingest, account deletion, reminders, welcome email, feedback. Local stack: `npx supabase start`.

### Other domain pieces

- **Multi-currency**: 14 display currencies; historical snapshots are valued at the FX rate **of their original date**, not today's — see [src/lib/fxConvert.ts](src/lib/fxConvert.ts) and the `fx-ingest` function. To add a currency, edit [src/lib/currencies.ts](src/lib/currencies.ts) (`CURRENCY_CODES` + its `CURRENCIES` entry) and the currency answer in the FAQPage JSON-LD in [index.html](index.html) (static HTML can't import the list; `src/pages/landing/faqs.test.ts` fails until they match); `fx-ingest` has no list and already stores every code Frankfurter publishes. `fxConvert.test.ts` hardcodes a few codes as *unsupported* (e.g. CNY, MXN) — swap one out if you're adding it. The count in [README.md](README.md) and this file is hand-maintained.
- **Forecast/stats**: [src/lib/forecast.ts](src/lib/forecast.ts), `scenarioForecast.ts`, `drawdownStats.ts`, `goalEta.ts`. The in-app projection cone is fitted to the user's own variance; the PDF report's forecast uses trailing 3-year CAGR (intentionally different).
- **Billing/plans**: [src/lib/billing/plans.ts](src/lib/billing/plans.ts) holds Stripe `prod_`/`price_` IDs and the Free/Pro/Family entitlement map (`planHas`). EUR-only: Pro €9/mo or €90/yr, Family €14/mo or €120/yr. Edge functions can't import `src/`, so [supabase/functions/_shared/billingPlans.ts](supabase/functions/_shared/billingPlans.ts) mirrors the IDs (checkout allow-list, product→plan map) and its parity test fails if they drift. A Pro subscriber moves to Family through `customer-portal`'s `switch_to_family` flow, never a second checkout.
- **Legal pages**: edit the markdown in [docs/legal/](docs/legal/) — it's the source of truth, imported via `?raw` and rendered by [MarkdownLegal.tsx](src/components/legal/MarkdownLegal.tsx). Don't edit the React page bodies.
- **SEO/prerender**: [vite-plugins/seo-route-html.ts](vite-plugins/seo-route-html.ts) + `scripts/prerender.mjs` + `src/lib/seo/routeMeta.ts`. Build with prerender via `npm run build:prerender`.
- **UI**: Tailwind + shadcn/ui (Radix) in `src/components/ui/`; a `q-*` design-token system layered on top in [src/index.css](src/index.css). No animation library: authored motion is CSS under `html[data-app-motion='on']`, which is set only when the OS allows motion (never under reduced motion or automation). Dialogs go through [useModalLayer](src/hooks/useModalLayer.ts) (portal, inert `#root`, topmost Escape). Numbers and dates go through [useFormat](src/hooks/useFormat.ts) and [src/lib/formatters.ts](src/lib/formatters.ts); source colours through [useSourceColors](src/hooks/useSourceColors.ts). [vite.config.ts](vite.config.ts) splits `libsodium`, a small `vendor` chunk (React and shared helpers) and `recharts` (loaded only by Performance); keep React out of the recharts chunk or every route preloads it.

## Conventions

- Comments explain **why**, not what — reserve them for invariants, hidden constraints, or surprises a reader couldn't infer.
- Don't add error handling for cases that can't happen. Validate at boundaries (user input, decoded JSON, network responses), trust internal types elsewhere.
- In-repo file references use markdown links, not backticks (most reading happens through GitHub/IDE).
- String literals: use the straight apostrophe `'` (U+0027), never curly `’` (U+2019); write prose containing apostrophes as double-quoted strings.
- User-facing copy: sentence case (headings, labels, buttons, chart titles, legend entries) and British spelling (`Customise`, `analyse`). Exclamation marks only in success toasts confirming a user action.
- Scope is deliberately narrow: an end-to-end encrypted net worth dashboard, **not** a budgeting/transaction/bank-syncing tool. Bank-connection or credential-storing features are out of scope by design — that constraint is what makes the encryption story credible.

## Working with quantive-internal/

The founder wants `quantive-internal/` to be a living, detailed knowledge base. When working there, lean into:

- **Detailed strategy docs** — full reasoning, not bullet-point summaries. The `docs/strategy/` docs are the master reasoning layer; write them as if someone will make a hard call from them six months from now without you in the room.
- **Explicit to-do lists with ownership and effort estimates** — e.g. the pre-HN2 gates table in `launch-calendar.md`. Always include time estimates and clear "done when" criteria.
- **Wishlists and backlog docs** — captured even if they will never ship. `feature-wishlist.md` is for things that might be built; future-reader-Pedro should be able to evaluate them against the rubric without re-deriving context.
- **Decision logs** — when a decision is made (e.g. cut a channel, change the ICP, flip the messaging frame), write it down with the date, what changed, and why. The `office-hours-2026-06-18.md` pattern is the model.

Treat every `quantive-internal/` doc as something the founder will reread before a hard call. Write for that reader, not for completeness or compliance.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
