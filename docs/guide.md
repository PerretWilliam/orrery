# Orrery user guide

Orrery is a self-hosted web app that turns each GitHub repository into a live control panel, described by a `.hub.yml` file in the repository. This guide covers installing it, configuring it, upgrading, backing up and writing a `.hub.yml`. For AI agents, see [agents.md](agents.md).

## What you need

- A PostgreSQL database (the only state Orrery keeps).
- A public HTTPS address for the instance (GitHub redirects users back to it after sign-in).
- A GitHub account that will own the GitHub App the first-run wizard creates.
- 32 random bytes as the encryption key: `openssl rand -base64 32`.

## Install

The reference deployment is Docker Compose: Orrery and PostgreSQL, from the image `ghcr.io/perretwilliam/orrery` (`linux/amd64` and `linux/arm64`, published with each release).

```bash
curl -O https://raw.githubusercontent.com/PerretWilliam/orrery/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/PerretWilliam/orrery/main/.env.example
cp .env.example .env   # set POSTGRES_PASSWORD and ORRERY_ENCRYPTION_KEYS, see below
docker compose up -d
```

Pin a version in `docker-compose.yml` (for example `:1.0.0`) instead of `latest`, and put a TLS reverse proxy in front of port 3000.

On start, Orrery applies its database migrations, then prints a line `Orrery is not set up yet` with a **setup token** (unless you set `ORRERY_SETUP_TOKEN`); read it with `docker compose logs orrery`. Open `/setup`, enter the token, and follow the wizard: it creates the GitHub App through a manifest and makes you the instance admin. Then sign in with GitHub and install the GitHub App on the accounts or repositories you want to see.

Keep `ORRERY_ENCRYPTION_KEYS` safe and backed up separately from the database: without it, the stored GitHub tokens and secrets cannot be read.

To build the image yourself, run `docker build -t orrery .`. To run without Docker, use Node.js 24: `npm ci && npm run build && npm start` with the environment variables below.

## Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. Without it, migrations and setup are skipped. |
| `ORRERY_ENCRYPTION_KEYS` | yes | Comma-separated `id:base64key` list, each key 32 bytes. The first one encrypts, the others only decrypt (key rotation). |
| `ORRERY_PUBLIC_URL` | recommended | Public origin of the instance. When set, GitHub pushes changes through webhooks; otherwise Orrery polls every few minutes. |
| `ORRERY_SETUP_TOKEN` | no | Fixed setup token (at least 24 characters, otherwise ignored with a warning). Never printed to the logs. |
| `ORRERY_ADMINS` | no | GitHub usernames, comma-separated, made instance admins on every start. The way back in if every admin is lost. |
| `ORRERY_SIGNIN_ALLOWLIST` | no | Seeds the sign-in allowlist while it is empty: `org:acme`, `team:acme/devs`, `user:octocat`, comma-separated. After that the admin owns the list. Unreadable entries are skipped with a warning. |
| `ORRERY_URL`, `ORRERY_TOKEN` | CLI only | Used by `orrery preview`: the instance and an agent token. Not read by the server. |

## Upgrade

1. Back up the database (below).
2. Change the image tag in `docker-compose.yml`, then `docker compose pull && docker compose up -d`.
3. Migrations run automatically at start. They only move forward, so go back by restoring the backup.

Read the changelog first: a release can change something that needs your attention.

## Back up and restore

All state is in PostgreSQL, so a database dump is a full backup. Keep `ORRERY_ENCRYPTION_KEYS` with it (in a secret store, not next to the dump).

```bash
docker compose exec -T db pg_dump -U orrery --format=custom orrery > orrery.dump
```

Restore into the database (stop Orrery first with `docker compose stop orrery`, start it again after):

```bash
docker compose exec -T db pg_restore -U orrery --no-owner --clean --if-exists -d orrery < orrery.dump
```

Test a restore now and then. The audit log is append-only in the database and is part of the dump.

## Who sees what

People sign in with GitHub and see the repositories GitHub lets them access, narrowed by the policy the admin sets under Admin (sign-in allowlist, per-project rules). Public repositories are not visible to strangers. Maintainers and admins of a repository manage its secrets.

## Write a `.hub.yml`

Put a `.hub.yml` at the root of the repository (the default branch is read). A minimal one:

```yaml
version: 1
project:
  name: Starfall
pages:
  - id: overview
    title: Overview
    widgets:
      - { type: github.pull_requests, state: open }
      - { type: github.workflow_runs, branch: main }
```

Add a data source of your own (an internal API, a status endpoint) and show it:

```yaml
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
      - { type: kpi, source: game_stats, path: data.retention.d7, label: Day-7 retention, unit: "%", alert: { below: 18 } }
```

- Secrets: create `GAME_API_TOKEN` in the project settings (maintainers only) and bind it to the hosts that may receive it. A secret is only ever sent to its bound hosts, and its value is never shown again.
- Hosts: sources can only reach hosts the admin or the project allows; private addresses are refused.
- `ttl` is how long a response is cached (10s to 24h, default 5m).
- Every field, widget type and limit is described in the JSON Schema at `/schema/hub-v1.json`, which editors can use for completion. [agents.md](agents.md) lists the widget types.

Check a file before committing it:

```bash
orrery validate .hub.yml
```

Errors carry a code, the path of the problem and a suggested fix. The same error appears in the UI, the CLI, the API and MCP.

## Agent tokens

Under Account > Agent tokens you can create a token for scripts and AI agents. It has your access and no more, expires, and can be revoked. See [agents.md](agents.md) for the REST API and MCP server.

## When something goes wrong

- **The setup page asks for a token:** read it in the container or process logs, or use the value of `ORRERY_SETUP_TOKEN`.
- **`ORRERY_ENCRYPTION_KEYS` errors at setup:** it must be `id:base64key` with a 32-byte key (`openssl rand -base64 32`).
- **No admin left:** set `ORRERY_ADMINS` to your GitHub username and restart.
- **A widget shows an error:** it names a stable code and a fix; the rest of the page keeps working.
- **Changes appear late:** without `ORRERY_PUBLIC_URL` Orrery polls; set it for webhooks.
