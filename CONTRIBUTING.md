# Contributing to Orrery

Thanks for helping. Orrery is AGPL-3.0; contributions are accepted under the same license. Read [AGENTS.md](AGENTS.md) too if you are an AI agent.

## Local setup

Requirements: Node 24 (see `.nvmrc`), Docker (integration tests only).

```bash
npm ci
npm run dev
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Generates Next types, then `tsc --noEmit` |
| `npm run lint` | ESLint, including `eslint-plugin-security` |
| `npm run coverage` | Unit and component tests, 100% coverage enforced |
| `npm run test:integration` | Testcontainers (Postgres) and MSW, needs Docker |
| `npm run test:e2e` | Playwright against the production build (`npm run build` first) |
| `npm run mutation` | Stryker, minimum score 90% on sensitive modules |
| `npm run size` / `npm run lighthouse` | Bundle (app shell and per-widget) and Lighthouse budgets (after a build) |
| `npm run ci:local` | Typecheck, lint, coverage, build and bundle budget |

## Conventions

- **Branches and PRs.** `main` is protected: open a pull request, every CI check must pass, the branch must be up to date, history stays linear (squash or rebase).
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`...). CI checks them; release-please builds the changelog and version from them.
- **Architecture.** Feature folders under `src/features/<name>/{domain,server,components}`. Logic lives in pure functions in `domain/` and `lib/`; routes and components stay thin.
- **Tests.** 100% statement and branch coverage on hand-written code under `src`. The exclusion list is `coverage.exclude.mts` (one reviewed file). Inline ignore comments need a written justification in the PR.
- **UI strings** are externalized (no hard-coded text in components).
- **Components.** Search the shadcn MCP and `docs/resources.md` before writing one by hand.
- **Security.** Anything that fetches, stores or renders outside data ships with negative tests. Report vulnerabilities privately through [GitHub security advisories](https://github.com/PerretWilliam/orrery/security/advisories/new), never in a public issue.
