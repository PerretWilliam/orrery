# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub: <https://github.com/PerretWilliam/orrery/security/advisories/new>. Do not open a public issue or pull request for a vulnerability.

Include what you found, how to reproduce it and the impact. We acknowledge reports as soon as possible and will keep you informed until a fix is released.

## Supported versions

Orrery has no stable release yet; only the latest `main` and the latest release receive security fixes.

## Scope

In scope: the Orrery application and its Docker image (authentication, access control, the data proxy and SSRF guard, secrets handling, webhooks, the REST API and MCP server). The threat model and the controls for each threat are listed in [docs/scope.md](docs/scope.md).

Out of scope: vulnerabilities in a project's own metrics endpoint, and findings that require an already-compromised host or administrator account.
