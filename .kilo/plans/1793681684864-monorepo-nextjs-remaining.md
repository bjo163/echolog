# Monorepo + Next.js migration — remaining work

## Current state
Scaffold done: `apps/`, `packages/`, `src`/`test` moved to `apps/api/`, workspace + turbo root config created.

## Remaining ordered tasks

1. **apps/api package**: create `apps/api/package.json` with api deps/scripts, `tsconfig.json`, keep engines node>=24<25. Move `.env` handling to `../../.env`.
2. **packages/config**: `tsconfig.base.json` with NodeNext settings.
3. **packages/contract**: extract DTO types from `client/types.ts` + src; build with tsc.
4. **packages/shared**: move `client/lib/*` (api, session, format, tone, watchlist); depend on contract; build.
5. **packages/ui**: move shadcn primitives + globals.css; source-only exports.
6. **apps/web**: scaffold Next.js 16 App Router; port App.tsx/views/components; rewrites `/api/*`, `/health/*` to 127.0.0.1:3006; transpilePackages; Tailwind v4 `@source` directives.
7. **Wire deps**: update imports to `@echolog/*` in api/web.
8. **CI/Docker**: update workflows and Dockerfile for monorepo paths.
9. **Cleanup**: remove old root files (vite.config.mjs, client/), update README.

## Validation
`pnpm install && pnpm typecheck && pnpm build && pnpm test`; dev servers on 3006/3106; login works.

## Open questions
- Whether to keep `.env` at root or per-app. Recommend root with `--env-file-if-exists=../../.env`.
