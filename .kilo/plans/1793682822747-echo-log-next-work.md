# ECHOLOG next work plan (>=10 tasks)

## Context
Monorepo scaffold complete: apps/api, apps/web, packages/*; typecheck+build pass. Remaining gaps: tests resolve compiled src directly; UI primitives not moved; no CI/Docker update; old root files remain.

## Ordered tasks
1. Move 11 shadcn primitives + globals.css from client/components/ui to packages/ui/src; update index exports.
2. Remove client/ after import updates (api tests already use @echolog).
3. Remove root vite.config.mjs and old root src/test references; update README.
4. Fix api test module resolution: tests import src/*.js; either build before test or change tests to import dist; add test script build dependency.
5. Add CI workflow (pnpm install, typecheck, build, test) for monorepo.
6. Update Dockerfile for monorepo paths and multi-stage build.
7. Port client App.tsx/views/components into apps/web App Router.
8. Add Tailwind v4 @source directives for apps/web and packages/ui.
9. Add health check endpoint proxy verification.
10. Add lint/format scripts and run in CI.
11. Add E2E smoke test for login + object upload.
12. Clean deprecated root package fields (main/dist) if unused.