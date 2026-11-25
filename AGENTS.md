# AGENTS.md

Orrery is a self-hosted web app that turns each GitHub repository into a live control panel (code state next to product health), described by a versioned `.hub.yml`. Read `docs/scope.md` first: it is the source of truth for scope, security requirements and architecture.

## Commands

```bash
npm ci                     # install
npm run dev                # dev server
npm run ci:local           # typecheck + lint + coverage + build + bundle budget (run before every PR)
npm run test               # unit/component tests (Vitest)
npm run test:security      # one negative test per threat of docs/scope.md (tests/security), also part of coverage
npm run test:integration   # Testcontainers + MSW, needs Docker
npm run test:e2e           # Playwright on the production build (npm run build first)
npm run mutation           # Stryker, min 90% on sensitive modules
```

## Architecture

- Stack: Next.js App Router, strict TypeScript, Tailwind v4, shadcn/ui on **Base UI** (`base-nova` style, not Radix), TanStack Query, Zod, Drizzle on PostgreSQL.
- `src/features/<name>/{domain,server,components}`: `domain/` is pure logic with no framework imports, fully tested; `server/` does database, Git and cache access; `components/` is thin UI. Shared code in `src/lib/`.
- Git hosts sit behind `GitProviderInterface` (`src/features/repos/domain/git-provider.ts`); GitHub only in V1.
- Before writing a UI component, search the shadcn MCP and `docs/resources.md`.

## Rules

- **Quality:** 100% statement and branch coverage on hand-written code under `src`. Exclusions live only in `coverage.exclude.mts`; inline ignores need a written justification in the PR. Sensitive modules (config parser, SSRF guard, crypto, permission checks, secret host binding) must survive mutation testing.
- **Security:** anything that fetches, stores or renders outside data ships with negative tests. Never log or return secret values; agents may see a secret's name and bound hosts only. Source data is untrusted: render as text, mark as `"trust": "untrusted"` in API/MCP output. Access checks fail closed. See the threat table in `docs/scope.md`.
- **Errors:** structured (stable code, JSON path, message, suggested fix), identical across UI, CLI, API and MCP. Codes are never reused or renamed once released.
- **UI strings** are externalized (next-intl, English catalog); no hard-coded text.
- **Git:** Conventional Commits, one pull request per change, squash or rebase (linear history). `main` is protected: all CI checks must pass.
- Keep modules small and typed. Prefer the standard library and existing dependencies over new ones.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
