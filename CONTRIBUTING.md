# Contributing to Quantive

Thanks for your interest in Quantive. This is a small, opinionated project. Your time is more valuable than what fits in any contributing guide, so the goal of this document is to be honest about what kinds of contributions are useful right now and which aren't.

## What we welcome

- **Bug reports** with a clear reproduction path. The shorter the path, the faster the fix.
- **Security disclosures**: please follow [SECURITY.md](SECURITY.md), not a public issue.
- **Patches that fix a real bug**, especially in the encryption module ([`src/lib/crypto/`](src/lib/crypto/)) where independent eyes are most welcome. The crypto module is MIT-licensed and intentionally I/O-free for review.
- **Documentation fixes**: typos, broken links, places where the code and the docs disagree.
- **Suggestions to remove code** that nobody uses. Subtraction is usually the most valuable contribution.

## What we don't welcome (right now)

- **New features without prior discussion.** The roadmap is small on purpose. Open an issue first; if there's no agreement on direction, please don't invest in code.
- **Large refactors** of working code, even if the refactor is "cleaner". The bar is "this fixes a real bug" or "this measurably improves performance / accessibility / security", not "this is more idiomatic".
- **Pull requests that touch encryption invariants without referring to [`docs/security/encryption.md`](docs/security/encryption.md)** by section number. The crypto design is the contract; if a PR changes behaviour the threat model relies on, the threat model must change with it.
- **AI-generated PRs that don't run.** We have nothing against AI tooling; we use it. But the PR author is responsible for verifying the change. Patches that fail `npm run lint`, `npm run test`, or `npx tsc --noEmit` will be closed.

## Local setup

See [README.md](README.md) for the basics. In short:

```sh
npm install
cp .env.example .env   # then fill in Supabase keys
npm run dev            # http://localhost:8080
```

For a fully local Supabase stack (Postgres + Auth + Functions in Docker):

```sh
npx supabase start
```

## Quality gates

Before opening a PR, all four of these must pass:

| Command | What it checks |
|---|---|
| `npm run lint` | ESLint. Must report **0 errors**. Warnings are tolerated only if they have a justification in the PR description. |
| `npx tsc --noEmit -p tsconfig.app.json` | TypeScript. Must report **0 errors**. The `noEmit` form catches everything `tsc` would refuse to build, including test files. |
| `npm run test` | Vitest. All tests must pass. Crypto tests are slow (real Argon2id parameters); a full run takes ~20 seconds. |
| `npm run build` | Production build. Catches Vite-side issues that the dev server's HMR papers over. |

If you're touching anything user-facing, also do a manual pass in the dev server. UI changes that "compile cleanly" but render broken still get rejected.

## Project conventions

A few non-obvious ones, the rest you can pick up by reading the code.

- **No comments unless they explain *why***. Code is the source of truth for *what*. Comments are for invariants, hidden constraints, or surprises a future reader couldn't infer from the code.
- **Don't add error handling or fallback paths for cases that can't happen.** Trust internal types and framework guarantees. Validate at boundaries (user input, decoded JSON, network responses), not at every layer.
- **Markdown links over backticks** for in-repo file references, since most readers see this through the GitHub UI or an IDE that resolves the link.
- **Migrations are forward-only.** Once a migration file is committed, it does not change. New migrations live in their own timestamped file.
- **RLS on every user-data table.** A migration that adds a new table without `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and at least a SELECT policy keyed by `auth.uid()` will not be merged.
- **No service-role keys in the client bundle.** `SUPABASE_SERVICE_ROLE_KEY` belongs only in edge function environments. If you have a use case that seems to require it client-side, the answer is almost always "edge function" instead.
- **Encryption invariants** ([`docs/security/encryption.md`](docs/security/encryption.md)) are load-bearing. Changes that touch the crypto module, AAD framing, KDF parameters, or `enc_version` semantics must update the design doc and reference the section number in the PR.
- **User-tied client state must reset on user-id transition** ([`docs/security/encryption.md` §8.6](docs/security/encryption.md)). Any new `localStorage`/`sessionStorage` key, React Query cache, or in-memory store that's keyed to *a specific user* must be wiped by the `PortfolioContext` watcher (or a parallel one, see [`QueryCacheGuard`](src/components/auth/QueryCacheGuard.tsx)) on sign-out and account switch. Authed users must never write plaintext portfolio data to `localStorage`; guests may.

## How to write a good PR

- One concern per PR. A bug fix that also "tidies up" three unrelated things is harder to review and harder to revert.
- The PR description should answer: **what does this change**, **why**, and **how do I verify it works?** The "how to verify" is the bit most PRs skip; please don't.
- If you changed user-visible behaviour, include a screenshot or a short before/after note. If the change is reversible (a feature flag, a flag-default flip), say so explicitly.
- Reference the issue number in the PR title or body.

## Reporting security issues

Please **do not** file public issues for security problems. The disclosure path is in [SECURITY.md](SECURITY.md): email or GitHub private security advisory. We aim to acknowledge within 48 hours.

## Licensing

By contributing, you agree that your contribution is licensed under the same license as the file you're touching:

- The crypto module under [`src/lib/crypto/`](src/lib/crypto/) is **MIT**, so patches there can be used freely.
- The rest of the repository is under the **PolyForm Noncommercial License 1.0.0** (see [LICENSE](LICENSE)).

If your employer has a contributor agreement that conflicts with either of those, please raise it before opening the PR rather than after.

## A note on scope

Quantive is a privacy-first personal-finance dashboard, not a budgeting tool, not a transaction tracker, and not an accounting system. Features that depend on connecting to external bank accounts, scraping balances, or storing third-party credentials are out of scope by design; that constraint is what makes the encryption story credible. Suggestions in that direction will be politely declined.

Thanks for reading this far.
