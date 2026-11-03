# Monorepo + Next.js migration plan (echolog)

## Goal
Convert the single-package repo into a pnpm + Turborepo monorepo:
- `apps/web` — Next.js 16 (App Router), operator console only (Vite React SPA migrated). Console stays client-side (`use client`) with rewrites to API so httpOnly session cookies remain first-party and no CORS surface.
- `apps/api` — Fastify service (REST + S3 SigV4 + OCI registry + streaming uploads + node:sqlite). Untouched behavior; just moved.
- `packages/config` — shared config: base tsconfig, tailwind/postcss presets/notes (source-only).
- `packages/contract` — REST DTO types (ObjectSidecar/ObjectReference, sidecars, grants, GC, storage stats, S3 keys, audit, short links, OCI repo items, etc.). Shared between api and web; built with tsc (dist + types) to be consumable by NodeNext.
- `packages/shared` — non-UI console logic: API client (`lib/api.ts`), session/whoami helpers, format/tone/watchlist helpers, types helpers (if not all in contract), etc. Built with tsc or source-only depending on usage; prefer built + types for stability.
- `packages/ui` — shadcn/ui primitives + theme (Tailwind v4). Source-only TSX consumed via Next.js `transpilePackages`.

## Decisions (from answers)
1. Next.js only for `apps/web`; Fastify remains in `apps/api` (cannot move S3 SigV4 raw body, OCI chunked uploads, streaming, node:sqlite).
2. Packages: `config`, `shared`, `ui`, `contract`.
3. Orchestration: pnpm workspaces + Turborepo.
4. `apps/web`: App Router, client-side console (minimal port risk). Keep `/p/:slug` and other public pages served by API.
5. Dev: `pnpm dev` runs api (3006) and web (3106) via Turborepo; web rewrites `/api/*` and `/health` to api.

## Constraints / invariants
- Keep README semantics: zero external deps beyond public npm/Node builtins where possible. Adding Turborepo is acceptable per user choice.
- No browser secrets in bundle (grant secret, S3 creds). Existing rules unchanged.
- Session cookie httpOnly first-party; no CORS. Rewrites provide this.
- S3/OCI behavior unchanged.
- Tests must still pass: `pnpm typecheck && pnpm build && pnpm build:client` equivalent + `pnpm test`. Adjust to monorepo (api tests move).
- Node >=24 <25 in api; Next 16 needs Node >=20.9 (ok).

## Target structure
```
echolog/
  apps/
    api/        (was ./src, ./test, package.json scripts: dev/build/start/test/user:add/typecheck)
    web/        (was ./client, migrated to Next.js App Router)
  packages/
    config/     (tsconfig.base.json, notes)
    contract/   (DTO types, built)
    shared/     (api client, lib/format, lib/tone, lib/session helpers etc, built or source)
    ui/         (shadcn components, globals.css/theme, source-only)
  turbo.json
  pnpm-workspace.yaml
  package.json (root: workspaces, turbo, shared scripts)
  tsconfig.json (root references)
```

## Mapping (concrete)
- `src/` → `apps/api/src/`
- `test/` → `apps/api/test/` (move; update imports to use `apps/api/src/...`)
- `package.json` scripts: split — root delegates via turbo/filter; `apps/api/package.json` owns api scripts; `apps/web/package.json` owns web scripts
- `cli/user:add` stays in api (`apps/api/src/cli/user-add.ts`)
- `client/` → migrate to `apps/web/` as Next.js app:
  - `app/layout.tsx` (html/body, dark class, fonts, globals.css)
  - `app/page.tsx` renders the console shell (make App client component)
  - `app/globals.css` imports `@echolog/ui/globals.css` + `@source` for app + package
  - `components.json` moves to `apps/web` with aliases pointing to `@echolog/ui` / local paths
  - views/components move under `apps/web/app/` or `apps/web/components/` as appropriate; keep structure recognizable
  - `client/index.html` replaced by Next layout
  - `client/main.tsx` → no longer needed (Next entry)
  - Vite config removed; Next config adds rewrites
- `dist/client/` no longer built by Vite; Next builds `.next/` (or standalone)

## Shared packages design
### packages/contract
- Export DTO interfaces matching API responses: `ObjectSidecar`, `ObjectReference`, `DownloadGrant`, `GcResult`, `StorageStats`, `S3KeyRecord`, `AuditLogRecord`, `ShortLinkRecord`, `OciRepositoryItem`, `ObjectRef`, health shapes, etc.
- Source: start by moving `client/types.ts` + relevant types from `src/core`/`src/types` into contract with no runtime deps. Keep naming consistent.
- `package.json`: `"name": "@echolog/contract"`, `"type": "module"`, `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`, `"exports": {".".{"types":"./dist/index.d.ts","default":"./dist/index.js"}}`, build with tsc.
- tsconfig: composite, declaration, NodeNext.

### packages/shared
- Console non-UI logic: `lib/api.ts` (fetch wrapper), `lib/session.ts` (whoami/signin/signout), `lib/format.ts`, `lib/tone.ts`, `lib/watchlist.ts`, `lib/utils.ts` if used by shared (or move to ui), etc.
- Depends on `@echolog/contract`. May import `@echolog/ui` types? unlikely.
- Built (dist) to avoid resolution issues across workspaces.
- Export paths: e.g. `@echolog/shared/api`, `@echolog/shared/session`, etc. or single entry.

### packages/ui
- shadcn primitives from `client/components/ui/*` moved here. `lib/utils.ts` (cn) likely stays in ui or shared — put cn in ui (`@/lib/utils` style or export from package).
- `globals.css` with Tailwind v4 theme tokens (migrate from `client/app/globals.css`).
- `package.json`: `"name": "@echolog/ui"`, source-only (no build). `"exports": {"./globals.css": "./src/globals.css", "./*": "./src/*"}` or map components. Use `transpilePackages: ["@echolog/ui", "@echolog/shared"]` in Next.
- Tailwind scanning: in web app's `globals.css` add `@import "@echolog/ui/globals.css";` and `@source` directives covering `../app`, `../components`, and `../../packages/ui/src`.

### packages/config
- `tsconfig.base.json` with common compilerOptions (target/module/NodeNext etc.), extend from it.
- Optional eslint/prettier if present later (not obvious now). Keep minimal.

## Turborepo setup
- `turbo.json` with pipeline: `build` (dependsOn `^build`), `dev` (cache false, persistent), `lint`/`typecheck`/`test` as appropriate.
- Root `package.json`: `"workspaces": ["apps/*", "packages/*"]`, scripts like `"dev": "turbo dev"`, `"build": "turbo build"`, `"typecheck": "turbo typecheck"`, `"test": "turbo test"`.
- `packageManager: "pnpm@10.33.4"` stays at root.

## Next.js config (apps/web)
- `next.config.ts` (or .mjs): `transpilePackages` for internal packages, rewrites for `/api/:path*` → `http://127.0.0.1:3006/api/:path*`, `/health/:path*` → `http://127.0.0.1:3006/health/:path*`. `reactStrictMode`, etc.
- `tsconfig.json` extends base, with paths mapping `@/*` to app root or to packages as needed; ensure it can resolve workspace packages.

## API changes (apps/api)
- Move all files; update relative imports (they still work if structure similar).
- `package.json`: move api-specific deps (fastify, @smithy/*, zod) here; devDeps (tsx, @types/node, etc.). Keep `"engines": {"node": ">=24 <25"}`.
- Scripts: `"dev": "tsx watch --env-file-if-exists=.env src/index.ts"`, `"build": "tsc -b"`, `"start": "node --env-file-if-exists=.env dist/index.js"`, `"test": "tsc -b ../.. && tsx --test test/*.test.ts"`, `"user:add": "tsx --env-file-if-exists=.env src/cli/user-add.ts"`, `"typecheck": "tsc --noEmit"`.
- Root `.env` can remain at repo root (node --env-file from api cwd looks in cwd; run from `apps/api` or set path). Better: keep `.env` at root and run api from root via `pnpm --filter @echolog/api dev` with `--env-file` pointing up, or copy/symlink. Or just document `cd apps/api && pnpm dev` reading `../../.env`. Alternatively put env loading in config to search parent dirs. Check current behavior: `--env-file-if-exists=.env` reads from cwd; easier to keep `.env` at root and run with `cd apps/api && node --env-file-if-exists=../../.env ...` or use `dotenv` not present. Simplest: in api scripts use `--env-file-if-exists=../../.env` or change cwd in turbo. Or copy `.env.example` guidance. Document in README after migration.
- Dockerfile needs updating for monorepo paths (`COPY apps/api ...`, build from workspace).

## CI updates
- `.github/workflows/ci.yml`: install at root, `pnpm typecheck`, `pnpm build`, `pnpm --filter @echolog/web build` (or equivalent), `pnpm test`. Image build path changes.

## Implementation order (safe, incremental)
1. **Scaffold workspace**: create `pnpm-workspace.yaml`, root `package.json` (workspace), `turbo.json`, move root tooling config as needed.
2. **Create packages**: `packages/config` (base tsconfig), `packages/contract` (extract types), `packages/shared` (extract console lib), `packages/ui` (extract shadcn + theme). Set up package.json/tsconfig/exports.
3. **Move API**: `apps/api/` with src/test/cli, update package.json/scripts/deps, fix imports if needed, ensure it still builds/runs.
4. **Migrate web to Next.js**: create `apps/web/` with Next App Router, port App.tsx + views + components, wire up providers/rewrite, use packages, replace Vite.
5. **Wire workspace deps**: update imports to `@echolog/*`, add deps in apps.
6. **Update scripts/CI/Docker**: turbo scripts, workflows, Dockerfile.
7. **Test & fix**: `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm test`, run dev servers.
8. **Cleanup**: remove old root `src/`, `client/`, `test/` (if moved), old config files (`vite.config.mjs`), update README/TODO/AGENTS if needed.

## Risks
- Import specifiers: NodeNext requires `.js` extensions in TS source; moving files can break. Need to update carefully.
- tsconfig paths vs package exports: packages need correct exports; Next needs transpilePackages + proper resolution.
- Tailwind v4 scanning across packages: must use `@source` in web globals.css pointing to packages/ui and app files.
- Tests: api tests import from `../src/...` relative to test/; after move to `apps/api/test/` paths change to `../src/...` (still correct if structure preserved). Console-lib tests move to shared or web tests — adjust.
- Env loading: `.env` location changes relative to cwd.
- Docker multi-stage for monorepo: need to copy workspace files.

## Validation
- `pnpm install` succeeds.
- `pnpm typecheck` passes.
- `pnpm build` builds packages + api + web.
- `pnpm test` passes (api tests; console-lib tests updated).
- `pnpm dev` starts api:3006 and web:3106; login works, console loads, API calls succeed via rewrite.
- S3/OCI endpoints still work (api unchanged).
- `pnpm user:add` works from api.

## Open questions (if any)
None critical — all key decisions resolved. Minor details (exact export maps, turbo cache config) can be decided during implementation.
