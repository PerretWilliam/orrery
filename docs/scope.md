# Orrery - Scope Document

Nov 20, 2026 · @William

## Vision

The hub is a self-hosted web app that turns each GitHub repository into a live control panel: the state of the code (issues, pull requests, CI, releases) next to the health of the product running in production (uptime, revenue, retention).

Each repository describes its own dashboard in a versioned `.hub.yml` file; the hub detects it and renders it as a tab. It targets developers and small teams running several projects (SaaS, games, internal tools, side projects) who want one place to answer two questions: where is the development, and is the product doing well?

The hub does not compute product metrics. Each project exposes its own numbers through an endpoint (for a game: retention, active players) and the hub fetches, caches and displays them. Anyone can run it with `docker compose up`. It is open source under AGPL-3.0. Provisional codename: Orrery.

## Built for AI agents

An AI agent must be able to set up, read and extend the hub as easily as a person, so every capability is a documented, machine-readable interface and agents get exactly the access limits humans have.

| Surface | What an agent can do | Phase |
| --- | --- | --- |
| Config schema | Write and check a `.hub.yml` against a published JSON Schema, with a description and an example on every field; the server validates with the same schema | 1 |
| CLI: validate | `orrery validate` checks a config offline with path-and-line errors (command name provisional) | 1 |
| CLI: preview | `orrery preview` dry-runs a source or widget against an instance with an agent token, honoring the host allowlist and secret host binding | 2 |
| REST API | Versioned read API (`/api/v1`) with an OpenAPI spec: projects, pages, widget data, data freshness, GitHub data | 2 |
| MCP server | The same read capabilities as tools for MCP clients over Streamable HTTP, authenticated by agent token: list projects, read a widget's data, explain an error, validate a config | 2 |
| Agent tokens | Per-user, read-only in V1, revocable, listed in settings and recorded in the audit log | 2 |
| Docs for agents | `llms.txt`, plain markdown docs, an `AGENTS.md`, and a ready-made agent skill that explains how to write a `.hub.yml` | 2 |

The validate command ships in phase 1 because it only needs the schema; preview needs the data proxy, which arrives in phase 2.

Principles that apply to every surface:

- **Structured errors.** Each error has a stable code, a JSON path, a human message and a suggested fix, identical in the UI, CLI, API and MCP, so an agent can correct its own output. The error catalog is defined in phase 1 with the schema; codes are never reused or renamed once released.
- **Same access rules.** An agent token inherits its owner's GitHub permissions and the admin policy, never more. The REST API and the MCP server run inside the same app and share the permission code.
- **No secret values.** Agents can see that a secret exists, its name and its bound hosts, never its value.
- **Untrusted source data.** Content coming from project endpoints is returned inside a field marked `"trust": "untrusted"`, as data, not instructions, to limit prompt injection through a compromised source.
- **Writes need a human.** Write tools arrive in V2 and follow a propose-then-confirm flow.

**Agent tokens in detail.** Tokens are shown once at creation and stored as a SHA-256 hash. Each token has a mandatory expiry (default 90 days, maximum 1 year) and stops working when its owner loses access, is excluded by the policy, or their GitHub session can no longer be refreshed. The REST API and MCP server are rate limited per token (default 600 requests per minute, configurable by the instance admin).

**Audit log.** Recorded events: sign-in and sign-out, agent token creation, use (first use per day) and revocation, secret creation, update and deletion (name only), access policy and allowlist changes, encryption key rotation, forced re-index. Entries are append-only, viewable by the instance admin, and kept 1 year by default.

The repository itself is agent-friendly: an `AGENTS.md`, small typed modules with logic isolated in `domain/`, and a CI suite (strict types, 100% coverage, mutation and security tests) that gives an agent fast, trustworthy feedback on its own changes.

## Decisions taken

Seven decisions are settled and shape everything below.

| Topic | Decision |
| --- | --- |
| License | AGPL-3.0: anyone offering the hub as an online service must publish their changes |
| Language | English for code, docs, errors and UI; every UI string externalized from day one so translations can be added later |
| Hosting | Self-hosted by anyone with Docker; no mandatory external SaaS |
| Collaboration | Multi-user from V1; roles come from GitHub permissions, narrowed by an access policy the instance admin controls |
| Git providers | GitHub in V1, behind a `GitProviderInterface`; GitLab in V3 |
| Scope split | V1: dashboards and read-only GitHub data. V2: Kanban, agenda, write actions |
| Quality | 100% coverage on hand-written code, mutation testing and a dedicated security suite on sensitive modules |

## Access model

Users sign in with GitHub, and what they see is what GitHub allows them to access, narrowed by an access policy that the instance admin controls; the hub has no role system of its own.

- **Authentication:** GitHub App user authorization. User tokens expire, so the hub stores the encrypted access and refresh tokens and renews them. If a refresh fails, the user's sessions and agent tokens are suspended until they sign in again.
- **Sessions:** 7-day rolling session, 30-day absolute maximum; signing out revokes the session server-side.
- **Visibility:** a project appears if the user has explicit access to the repository (owner, collaborator, organization member with repository access, or team member) and the GitHub App is installed on it. On a public repository, GitHub grants read to everyone; that implicit read does not count, so a public repository's dashboard (which may show revenue) is never visible to strangers who happen to pass the sign-in allowlist.
- **Instance admin:** the person who completes the first-run wizard. They manage instance-wide settings (sign-in allowlist, project rules, allowed private hosts, encryption key rotation) and can name additional admins by GitHub username. If every admin is lost, the `ORRERY_ADMINS` environment variable restores admin rights on next start.

| GitHub permission on the repo | Capability in the hub |
| --- | --- |
| read, triage | View the project tab and its widgets |
| write | Same as above; V2 adds Kanban edits and issue creation |
| maintain, admin | Manage project secrets and their bound hosts, manage project-level allowed hosts, force a re-index |

**Access policy.** The instance admin narrows access from a settings page, on two levels evaluated in order:

1. **Sign-in allowlist:** the GitHub organizations, teams or usernames allowed to sign in at all. The default is the members of the accounts where the GitHub App is installed.
2. **Project rules:** per repository, hide the project or restrict it to chosen teams or users.

Effective access is the intersection of the GitHub permission and the policy, and an explicit deny always wins. The first allowlist can be seeded by an environment variable, so a new instance is never open by accident.

**Caching and invalidation.** Permission lists are cached for 5 minutes. The webhooks `member`, `membership`, `organization`, `team`, `repository`, `installation` and `installation_repositories` invalidate the cache immediately. If a permission check fails or times out, access is denied (fail closed). In polling mode there are no webhooks, so the 5-minute cache window is the revocation delay.

**GitHub App permissions requested by the manifest (V1, read-only):** Metadata, Contents (to read `.hub.yml`), Issues, Pull requests, Actions, and organization Members (to evaluate team rules). Webhook events: the ones listed above plus `push`.

**Consequences.** No invitation flow and no role system to build; the only hub-side access data is the admin's policy. Revoking someone on GitHub revokes them in the hub within the cache window. The cost is a dependency on GitHub's rate limits, which the permission cache and `ETag` requests absorb.

## V1 scope

V1 delivers a fast, secure dashboard for production metrics and read-only GitHub data, and nothing that manages work items.

- **First-run wizard:** protected by a one-time setup token printed in the container logs at first start (or set through `ORRERY_SETUP_TOKEN`), so whoever reaches a fresh instance first cannot claim it. It creates the GitHub App through the manifest flow (one click, no manual key copying) and the instance admin, then invalidates the setup token.
- **Sign-in and access:** GitHub login, visibility and capabilities derived from repository permissions, narrowed by the admin's access policy (sign-in allowlist, per-project rules).
- **Discovery:** finds repositories with a `.hub.yml` or `.repo-hub.yml` at the root of the default branch; if both exist, `.hub.yml` wins and the tab shows a warning. One config per repository. Other branches and pull requests are never read. Updates arrive by `push` webhook on the default branch when `ORRERY_PUBLIC_URL` is set and reachable by GitHub; otherwise by periodic polling with `ETag` every 5 minutes by default (configurable, 1 minute minimum).
- **Config:** versioned schema, strict validation, and a readable error (line and message) shown in the tab when the file is invalid. The last valid config keeps rendering until the error is fixed, with the error shown above it.
- **Data proxy:** per-source cache with TTL, 3-second timeout, stale-while-revalidate, failure isolated to the single widget, secrets referenced as `${SECRET_NAME}` and resolved server-side, configurable host allowlist. Methods `GET` and `POST` (static JSON body, for GraphQL endpoints).
- **Secrets:** project-scoped, created in the UI by maintainers and admins, each bound to the hosts it may be sent to. Secrets can be interpolated into headers and query parameters only, never into the scheme or host of a URL.
- **Widgets:** the catalog in the next section, including built-in read-only GitHub data (issues, pull requests, workflow runs, releases).
- **UI:** tabs with remembered state, grid layout declared in YAML, data freshness indicators, themes through shadcn CSS variables (light and dark).
- **Operations:** `GET /healthz` (liveness) and `GET /readyz` (database reachable, migrations applied) for Docker health checks; structured JSON logs on stdout; database migrations applied automatically at startup, with a refusal to start on a schema newer than the app.
- **Distribution:** Docker image on GHCR for `linux/amd64` and `linux/arm64`, semantic versioning with a changelog, reference `docker-compose.yml`, documented environment variables, and a human guide (install, upgrade, backup and restore with `pg_dump`, writing a `.hub.yml`).

**Agent interfaces:** the published JSON Schema and validate command in phase 1; the preview command, REST API, read-only MCP server, agent tokens and agent docs in phase 2, as described in Built for AI agents.

**Done when:**

- A fresh instance goes from `docker compose up` to a first rendered tab in under 10 minutes, following only the install guide.
- A tab with 10 widgets shows cached content in under 1 second (p95, measured by Playwright on a 2 vCPU / 4 GB reference machine), and a down source affects only its own widget.
- A user without explicit read access to a repository cannot see its tab, its data or its secrets, and neither can a user excluded by the admin policy, proven by automated tests.
- A user with write access who edits `.hub.yml` cannot send a secret to a host it is not bound to, proven by automated tests.
- An agent with a read-only token can list projects and read a widget through the MCP server, and an invalid `.hub.yml` produces the same structured error in the CLI, the API and the UI.

## Config file and widgets

The `.hub.yml` file is the contract between a repository and the hub: it declares data sources, pages and widgets, and its Zod schema (exported as JSON Schema for editor autocompletion) is frozen with a `version` field before any widget code is written. A future `version: 2` is supported side by side with version 1 for at least one major release.

```yaml
version: 1
project:
  name: Starfall
  color: "#7c3aed"
sources:
  game_stats:
    url: https://api.starfall.example/internal/stats
    method: GET
    headers:
      Authorization: Bearer ${GAME_API_TOKEN}
    ttl: 60s
pages:
  - id: overview
    title: Overview
    widgets:
      - type: kpi
        source: game_stats
        path: data.retention.d7
        label: Day-7 retention
        unit: "%"
        alert: { below: 18 }
      - type: github.pull_requests
        state: open
```

This sample is illustrative; the final schema is the first deliverable of phase 1. Widgets live in a registry, so adding a type never touches the YAML parser.

**Limits.** Config file 256 KB maximum, nesting depth 32, no YAML anchors or aliases beyond 100 expansions, 50 sources and 100 widgets per config. Source TTL between 10 s and 24 h (default 5 min).

| Widget | Data | Notes |
| --- | --- | --- |
| `kpi` | Project source | Value, trend, unit, alert threshold |
| `line`, `bar`, `donut` | Project source | X/Y mapped by JSON path |
| `table` | Project source | Sortable, searchable, status badges, virtualized for long lists |
| `status` | Project source | Health check or uptime: up, degraded, down |
| `cohort` | Project source | Retention matrix (rows = cohorts, columns = days), the main game-analytics use case |
| `markdown` | Inline or source | Sanitized notes and alerts |
| `github.issues`, `github.pull_requests`, `github.workflow_runs`, `github.releases` | GitHub API | Read-only in V1 |

An `alert` threshold only changes how the widget looks (color and icon); it never sends a notification, which stays out of scope. Trend values come from the source in V1, through a JSON path of their own. Storing history in the hub (snapshots for sparklines and trends) is a V2 option.

## Security requirements

Every feature that fetches, stores or renders data from outside the hub ships with negative tests; each threat below has a control and a test that proves it.

| Threat | Control | Test proves |
| --- | --- | --- |
| SSRF through source URLs | Block private, loopback, link-local and cloud-metadata addresses by default. Only the instance admin can allowlist private hosts or CIDR ranges (needed for homelab targets); project-level allowlists can only narrow access among public hosts and the admin's list. DNS resolved once and pinned, every redirect revalidated (5 redirects maximum), http and https only | IPv4 and IPv6 private ranges, decimal and octal forms, DNS rebinding, redirect to an internal address, allowlist honored, a maintainer cannot open a private range |
| Secret exfiltration through config | Config read only from the default branch; each secret bound to hosts, and the proxy refuses to send it anywhere else; secrets never interpolated into the URL host | A config edited to point a secret at another host fails with a structured error and no request leaves the hub |
| Secret leakage | AES-256-GCM at rest, key from the environment, ciphertext tagged with a key ID so rotation re-encrypts in the background without downtime; secrets write-only (never returned by the UI, API or MCP), redacted from logs and errors | Round trip, tampering detected, rotation, no secret in any response, log or error fixture |
| Broken access control | Every query scoped by the verified GitHub permission and the admin access policy, fail closed | User A cannot read the tab, data or secrets of a repository they cannot access, that the policy hides from them, or that is public without explicit access |
| Instance takeover at setup | One-time setup token for the first-run wizard | Wizard refused without the token, token unusable after setup |
| Malicious config | File size cap, alias and depth limits, unknown fields rejected, JSON paths evaluated by a safe extractor (no `eval`) | Oversized file, alias bomb, `__proto__` keys |
| XSS | Sanitized Markdown, strict CSP, source values rendered as text | Script payloads in Markdown and in source data |
| Webhook forgery | HMAC signature check with constant-time compare, delivery ID dedupe | Bad signature, replayed delivery |
| Session and token theft | `HttpOnly`, `Secure` and `SameSite` cookies, CSRF protection on mutations, GitHub tokens encrypted, agent tokens hashed | Cookie flags, mutation without CSRF token rejected, no agent token in clear in the database |
| Response abuse | 5 MB size cap, 3 s timeout and JSON content-type check on every source response | Huge body, slow body, wrong content type |
| API abuse | Per-token rate limits on the REST API and MCP server | Requests over the limit get a structured 429 |
| Supply chain | Lockfile, dependency audit, secret scanning, pinned CI actions | CI gates fail on a vulnerable or leaked dependency |

A `SECURITY.md` documents how to report vulnerabilities privately. Agent access (API tokens and MCP) follows the same rules: tokens are scoped, revocable and audited, expose secret names but never values, and responses mark source content as untrusted data.

## Quality policy

Hand-written code must reach 100% statement and branch coverage, enforced in CI, and the security-critical modules must also survive mutation testing so the 100% means something.

**Coverage scope.** All hand-written code under `src` counts. Excluded: components generated by shadcn (`components/ui`), configuration files, type-only files and generated migrations. The exclusion list lives in one reviewed file, and any inline ignore comment needs a written justification in the pull request.

**Architecture serves the rule.** Routes and components stay thin; logic lives in pure functions under each feature's `domain/` and in `lib/`, so it can be tested without a framework.

| Layer | Tooling | Covers |
| --- | --- | --- |
| Unit | Vitest, v8 coverage | Pure logic: config parser, widget registry, SSRF guard, crypto, permission mapping, secret host binding |
| Component | Vitest, Testing Library | Widgets and their loading, error and empty states |
| Integration | Testcontainers (Postgres), MSW | Data proxy, cache, webhooks, GitHub and project APIs mocked |
| End to end | Playwright | Critical journeys: first run, sign-in, repo detection, tab load, failing widget |
| Mutation | Stryker | Config parser, SSRF guard, crypto, permission checks, secret host binding; minimum score of 90% |
| Static analysis | Semgrep, `eslint-plugin-security`, CodeQL, gitleaks, OSV-Scanner | Code patterns, secrets, vulnerable dependencies |

**CI gates, all required to merge:** type check, lint, coverage threshold, mutation score, security scans, bundle size budget and Lighthouse budget.

**Repository and collaboration.** `main` is protected by a ruleset: pull request required, every CI gate required, branch up to date before merge, linear history, no force-push or deletion. Secret scanning with push protection, Dependabot alerts and security updates, and private vulnerability reporting are enabled. The repository ships `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, issue and pull request templates, and a Dependabot config for npm, GitHub Actions and Docker. Commits follow Conventional Commits, checked in CI, and release-please produces the changelog and semantic versions.

## Performance

A tab must show useful content from cache in under 1 second, and no slow or broken source may delay the rest of the page.

| Requirement | Target | Mechanism |
| --- | --- | --- |
| Initial load | Only the project list and light metadata | Server components for the shell, tab data fetched when the tab opens |
| Cached render | Under 1 s with 10 widgets (p95, reference machine) | Stale-while-revalidate: last known values shown immediately, refreshed in the background |
| Failure isolation | 3 s timeout per source | One request per widget with its own `Suspense` boundary; an error state replaces only that widget |
| Outbound load | One request per source, however many viewers | Request coalescing and per-source TTL; `ETag` conditional requests to GitHub |
| Large data | Smooth with thousands of rows or points | TanStack Virtual for tables; uPlot available as a heavy time-series widget behind the same registry |
| Bundle | 200 kB gzipped first-load JS per route; 50 kB per lazy widget chunk, 100 kB for chart widgets (initial values, revisited after the first baseline) | Widget code loaded lazily through the registry; no moment or full lodash; React Compiler |
| Audit | Lighthouse performance score of 90 or more on the sign-in page and a 10-widget tab | Lighthouse CI on every pull request |

Database indexes are designed with the schema, not added after the first slow query.

## Architecture and stack

The hub runs as two containers, the app and PostgreSQL, so that anyone can start it with one `docker compose up`; Redis is an optional adapter, not a requirement. V1 supports a single app replica: request coalescing and the in-process LRU assume one process. Running several replicas requires the Redis adapter and is not a V1 goal.

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router), strict TypeScript |
| UI | Tailwind v4, shadcn/ui on Radix, themes as CSS variables |
| Auth | Better Auth with its GitHub provider, using GitHub App user authorization; fallback to Octokit OAuth helpers if the phase 1 spike shows token refresh is unsupported |
| Database | PostgreSQL with Drizzle |
| Jobs and cache | pg-boss and a cache table on PostgreSQL, plus in-process LRU; optional Redis adapter. Cache entries unused for 7 days are purged by a daily job |
| Git access | Octokit behind a `GitProviderInterface` |
| Validation | Zod, exported as JSON Schema; `yaml` parser |
| Client data | TanStack Query |
| Layout and data views | react-grid-layout, TanStack Table and Virtual, shadcn charts (Recharts) |
| i18n | next-intl with an English catalog only; a lint rule rejects hard-coded UI strings |
| MCP | Official TypeScript MCP SDK, Streamable HTTP transport, mounted inside the Next.js app |

The structure is feature-based, with a shared `ui` layer. shadcn already provides the atoms and molecules, so strict Atomic Design would add folders without adding clarity; features are also the natural unit for testing.

```
src/
  components/ui/        generated shadcn components (excluded from coverage)
  features/
    auth/  access/  repos/  config/  widgets/  data-proxy/  secrets/  agents/  audit/
      domain/          pure logic, fully tested, no framework imports
      server/          database, Git and cache access
      components/      feature UI
  lib/                 crypto, ssrf-guard, cache, env
```

A `docs/resources.md` file lists the shadcn registry, blocks, theme tools and starter dashboards to reuse before writing any component by hand, and the project rule is: search the shadcn MCP and that file first.

## Roadmap and out of scope

V1 ships after two phases; each phase has a gate that must pass before the next starts.

| Phase | Content | Gate |
| --- | --- | --- |
| 1. Foundation | Auth spike, CI pipeline and repository protection, first-run wizard with setup token, GitHub sign-in, access model and policy, repo discovery, frozen `.hub.yml` schema and parser, error catalog, tab shell, published JSON Schema and validate command, health endpoints | A fresh instance renders the tab shell (pages and widget placeholders from the layout, or the config error) for a real repository; access-control and policy tests green; auth spike confirms token refresh |
| 2. Data engine and widgets | Data proxy, cache, secrets with host binding, SSRF guard, widget catalog, GitHub widgets, themes, preview command, REST API with OpenAPI spec, read-only MCP server, agent tokens, audit log, agent docs, human guide, Docker image | V1 done criteria met, 100% coverage, security suite and mutation checks green |
| V2 | Kanban synced with GitHub Issues, agenda and milestones, notes, consolidated multi-project view, write actions, including MCP write tools behind human approval (needs Issues and Pull requests write permissions), optional history snapshots | Defined after V1 feedback |
| V3 | GitLab through the provider interface, sandboxed custom widgets (no access to hub cookies or storage), advanced multi-page layouts | Defined after V2 |

**Out of scope for now:** mobile app, notifications and alerting, an official hosted SaaS, a role system independent of GitHub, several app replicas without Redis, and storing metric history in the hub before V2.

## Open questions

- [ ] **Final name.** Orrery is a provisional codename; choose the final name before the first public release and check it is free on GitHub, npm and GHCR.