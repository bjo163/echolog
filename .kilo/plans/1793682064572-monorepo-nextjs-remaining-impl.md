# Monorepo + Next.js migration — remaining implementation plan

## Goal
Complete remaining migration per `.kilo/plans/1793681684864-monorepo-nextjs-remaining.md`: packages/ui source, apps/web Next.js scaffold + port, CI/Docker, cleanup.

## Ordered tasks
1. packages/ui: move shadcn primitives from client/components/ui + globals.css; source-only exports with transpilePackages.
2. apps/web: scaffold Next.js 16 App Router; port App.tsx/views/components; rewrites /api/* and /health/* to 127.0.0.1:3006; transpilePackages; Tailwind v4 @source directives.
3. Wire imports to @echolog/* in api/web.
4. CI/Docker: update workflows and Dockerfile for monorepo paths.
5. Cleanup: remove old root files (vite.config.mjs, client/), update README.

## Validation
pnpm install && pnpm typecheck && pnpm build && pnpm test; dev servers 3006/3106; login works.
