# Quantive

A privacy-first personal finance cockpit. Track your net worth over time, analyse asset allocations, and forecast your future — with every byte of portfolio data encrypted before it leaves your device.

**Live:** https://usequantive.app

![Quantive dashboard — net worth chart, allocation treemap, KPI cards](public/images/dashboard.jpg)

---

## How the encryption works

Most finance apps store your data in plaintext on the server. Quantive doesn't.

When you set up an account, a random 256-bit data key (DK) is generated in your browser. That DK is wrapped (encrypted) by a key-encryption key (KEK) derived from your password via **Argon2id** (t=3, m=64 MiB, p=1). The KEK is never stored — it is re-derived on each login. The server only ever receives the wrapped DK and the encrypted snapshot.

```
Password → Argon2id(salt) → KEK
KEK → XChaCha20-Poly1305 → wrapped DK          (stored in user_keys)

DK + random 24-byte nonce → XChaCha20-Poly1305 → encrypted_data  (stored in portfolio_snapshots)
```

This separation matters: changing your password re-wraps the DK under a new KEK — it does not re-encrypt your entire history.

Each ciphertext includes **AAD** bound to your user ID and schema version, so even with full database write access an attacker cannot transplant one user's ciphertext into another's row — the AEAD tag check fails before any plaintext is exposed.

A **24-word BIP-39 mnemonic** serves as a recovery path — a second KEK derived from the mnemonic wraps the same DK, so you can regain access without your password. The mnemonic is shown once and never stored. If you skip it and forget your password, your data is gone by design.

The crypto module (`src/lib/crypto/`, 11 files) is pure TypeScript — no I/O, no side effects — and licensed MIT for independent auditing.

![Recovery code setup — 24-word BIP-39 mnemonic, confirm by typing word #6](public/images/recovery-code.png)

---

## Features

**Free**
- Net worth tracking with unlimited sources
- Full allocation charts — by volatility class, liquidity, and source
- Multi-currency display — 13 currencies (EUR, USD, GBP, NOK, SEK, DKK, CHF, CAD, AUD, JPY, PLN, BRL, INR); historical snapshots valued at the exchange rate of their original date, not today's rate
- Spreadsheet import and manual balance entry
- Cloud sync with end-to-end encryption
- Rolling 12-month history view
- Demo mode — full dashboard without signing up

**Pro (€9/month OR €90/year, ~€7.50/mo)**
- Full historical view — every snapshot since you started, charted and tabular
- CAGR-based net worth projection with 95% confidence intervals
- Excel/CSV export — full data portability, any time
- Priority support

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript 5, Vite 5 (SWC) |
| Routing / state | React Router 6, TanStack Query 5 |
| UI | Tailwind CSS 3 + shadcn/ui + Radix UI |
| Charts | Recharts 2 |
| Animation | Framer Motion 12 |
| Crypto | libsodium-wrappers-sumo (XChaCha20-Poly1305, Argon2id) |
| Backend | Supabase (Postgres + Auth + Edge Functions on Deno) |
| Payments | Stripe |
| Tests | Vitest (unit) + Playwright (E2E) |

---

## Local development

Requires Node.js ≥ 20 (use [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
git clone https://github.com/pedromlsreis/quantive
cd quantive
npm install
cp .env.example .env   # fill in your Supabase keys
npm run dev            # the dev server runs on http://localhost:8080
```

**.env.example**
```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_POSTHOG_KEY=          # optional — analytics
VITE_POSTHOG_HOST=         # optional — e.g. https://eu.i.posthog.com
```

---

## Scripts

```sh
npm run dev           # dev server
npm run build         # production build
npm run preview       # preview production build locally
npm run typecheck     # tsc --noEmit (must pass before PRs)
npm run lint          # ESLint (zero errors required)
npm run test          # unit tests via Vitest (~20 s, crypto-heavy)
npm run test:watch    # watch mode
npm run test:e2e      # Playwright headless
npm run test:e2e:ui   # Playwright with interactive UI
npm run test:all      # unit + E2E
```

All four gates must pass before a pull request is mergeable: `lint`, `typecheck`, `test`, `build`.

---

## Project structure

```
src/
├── lib/crypto/       # Pure crypto module (MIT) — AEAD, KDF, recovery, key wrapping
├── lib/              # forecast, fxConvert, dataProcessor (Excel parser), types
├── contexts/         # Auth, Portfolio, KeySession, Currency, Preferences
├── pages/            # Dashboard, Allocations, Forecast, Sources, Settings, Admin
├── components/       # charts/, dashboard/, auth/, layout/, ui/ (shadcn)
└── hooks/

supabase/
├── migrations/       # 9 forward-only SQL migrations
└── functions/        # Deno edge functions: Stripe webhook, FX ingest, admin APIs
```

---

## Security

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md).

Crypto patches must reference the relevant section of `docs/security/encryption.md` by heading. New crypto primitives or parameter changes require a written rationale.

---

## License

The application code is released under the [PolyForm Noncommercial 1.0.0](LICENSE) licence.  
The crypto module (`src/lib/crypto/`) is released under the MIT licence.
