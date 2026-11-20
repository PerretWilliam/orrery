# Spike: Better Auth + GitHub App user authorization

Date: 2026-11-20 · Better Auth 1.7.27 · Script: `spikes/auth-refresh/spike.mjs` (`npm i && npm run spike`)

## Verdict

**Better Auth's built-in `github` provider refreshes GitHub App user tokens. No fallback to Octokit OAuth helpers is needed.**

Verified against the real Better Auth code path (sign-in callback, encrypted storage, `getAccessToken`) with GitHub mocked at the `fetch` level. **Not verified against a live GitHub App**: it needs an App created by the maintainer. The first-run wizard / sign-in cards will exercise it for real; the phase 1 gate should re-confirm refresh on the live App.

## What the spike proves

| Check | Result |
| --- | --- |
| Sign-in stores access and refresh tokens, both expiries, encrypted (`account.encryptOAuthTokens: true`) | ok |
| Expired access token is refreshed through `grant_type=refresh_token` | ok |
| GitHub rotates the refresh token (single use): the new one is persisted | ok |
| Valid token is served without calling GitHub | ok |
| Refresh failure (GitHub answers HTTP 200 with `{error: "bad_refresh_token"}`) throws `FAILED_TO_GET_ACCESS_TOKEN` | ok |

## Findings the real implementation must handle

1. **Concurrent refresh breaks.** Refresh tokens are single use. Two parallel `getAccessToken` calls on an expired token both call GitHub; one wins, the other fails (spike: `fulfilled, rejected`). The hub needs a per-account single-flight/lock around token retrieval, otherwise a burst of requests would be read as "refresh failed" and suspend the user's sessions and agent tokens.
2. **Email is mandatory.** Better Auth rejects sign-in (`email_not_found`) when GitHub returns no email. A GitHub App only exposes it with the user permission "Email addresses" (read). Either request that permission in the App manifest (it is not in the scope's permission list), or provide a placeholder through `mapProfileToUser` (e.g. `<id>+<login>@users.noreply.github.com`). Recommendation: placeholder, so the hub asks for nothing beyond the scope's list.
3. **`getAccessToken` API in 1.7.x** selects the account with `accountId` (or `useAccountCookie`), not `providerId`.
4. **Scopes are irrelevant.** GitHub Apps ignore OAuth scopes (permissions come from the App); the provider's default `read:user user:email` is harmless.
5. **Failure detection.** A failed refresh is only visible as the `FAILED_TO_GET_ACCESS_TOKEN` error; the "suspend sessions and agent tokens" rule from the scope must be implemented around it (card "Connexion GitHub et sessions").
