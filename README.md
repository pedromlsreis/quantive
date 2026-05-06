# Quantive

A privacy-first finance cockpit. Upload your spreadsheet, track net worth, analyse allocations, and forecast your future.

Live: https://usequantive.app

## Tech stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn-ui
- Supabase (auth, Postgres, edge functions)
- Stripe (subscriptions)

## Local development

Requires Node.js (use [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)) and [Bun](https://bun.sh/) (or npm).

```sh
git clone <repo-url>
cd quantive
bun install            # or: npm install
cp .env.example .env   # then fill in Supabase keys
bun run dev            # or: npm run dev
```

The dev server runs on http://localhost:8080.

## Scripts

- `bun run dev` — start dev server
- `bun run build` — production build
- `bun run test` — run unit tests (vitest)
- `bun run lint` — eslint
