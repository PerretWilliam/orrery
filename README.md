<div align="center">

<img src="src/app/icon.svg" alt="" width="96" height="96">

# Orrery

**A self-hosted control panel for your GitHub repositories.**

Code state next to product health, one tab per repository, described by a versioned `.hub.yml`.

[![CI](https://github.com/PerretWilliam/orrery/actions/workflows/ci.yml/badge.svg)](https://github.com/PerretWilliam/orrery/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

[User guide](docs/guide.md) · [For AI agents](docs/agents.md) · [Scope](docs/scope.md) · [Contributing](CONTRIBUTING.md)

</div>

## Why

When you run several projects, two questions come back: **where is the development, and is the product doing well?** Orrery answers both on one screen. It reads issues, pull requests, CI runs and releases from GitHub, and fetches your own numbers (uptime, revenue, retention) from endpoints you expose.

## Features

- **Config as code.** Each repository describes its dashboard in a `.hub.yml`, validated against a [published JSON Schema](public/schema/hub-v1.json).
- **Widgets.** KPI, line, bar, donut, table, status, cohort, Markdown, plus GitHub issues, pull requests, workflow runs and releases.
- **GitHub permissions, nothing more.** No role system: people see the repositories GitHub lets them access, narrowed by an admin policy. Checks fail closed.
- **Safe data proxy.** Per-source cache, host allowlist, and secrets bound to the hosts they may be sent to.
- **Built for agents.** CLI, read-only REST API (OpenAPI) and MCP server, with the same structured errors as the UI.
- **Self-hosted.** One Docker image and PostgreSQL. No mandatory external service.

## A `.hub.yml`

Put it at the root of a repository, on the default branch:

```yaml
version: 1
project:
  name: Starfall
sources:
  game_stats:
    url: https://api.starfall.example/internal/stats
    headers:
      Authorization: Bearer ${GAME_API_TOKEN}
    ttl: 60s
pages:
  - id: overview
    title: Overview
    widgets:
      - { type: kpi, source: game_stats, path: data.retention.d7, label: Day-7 retention, unit: "%" }
      - { type: github.pull_requests, state: open }
      - { type: github.workflow_runs, branch: main }
```

## Quick start

You need Docker, and a public HTTPS address for GitHub sign-in.

```bash
curl -O https://raw.githubusercontent.com/PerretWilliam/orrery/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/PerretWilliam/orrery/main/.env.example
cp .env.example .env   # set POSTGRES_PASSWORD and ORRERY_ENCRYPTION_KEYS
docker compose up -d
```

Then open `/setup` and enter the setup token printed by `docker compose logs orrery`. The [user guide](docs/guide.md) covers the wizard, environment variables, upgrades and backups.

> The Docker image is published with each release. Until the first one is out, build it from a clone: `docker build -t ghcr.io/perretwilliam/orrery:latest .`

## Try it locally

Every screen, with a fake GitHub and demo data. Needs Node 24 and Docker; no GitHub App or `.env`.

```bash
npm ci
npm run demo
```

## Development

Next.js (App Router), strict TypeScript, Tailwind CSS, shadcn/ui on Base UI, Drizzle on PostgreSQL.

```bash
npm run dev        # dev server
npm run ci:local   # typecheck, lint, coverage, build and budgets
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the test suites and conventions. Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE): if you offer Orrery as an online service, you must publish your changes.
