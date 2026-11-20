// Spike: Better Auth GitHub provider + GitHub App user tokens (expiring access + single-use refresh token).
// GitHub is mocked at the fetch level; everything else is the real Better Auth code path.
import assert from "node:assert/strict";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

const realFetch = globalThis.fetch;
const tokenCalls = [];
let refreshMode = "ok"; // ok | bad
let n = 0;
const used = new Set();
let withEmail = true;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  if (url === "https://github.com/login/oauth/access_token") {
    const body = new URLSearchParams(String(init.body));
    tokenCalls.push(Object.fromEntries(body));
    if (body.get("grant_type") === "refresh_token") {
      // GitHub answers 200 with an error body on a bad/used refresh token
      if (refreshMode === "bad" || used.has(body.get("refresh_token")))
        return json({ error: "bad_refresh_token", error_description: "The refresh token passed is incorrect or expired." });
      used.add(body.get("refresh_token"));
      n++;
      return json({ access_token: `ghu_new${n}`, expires_in: 28800, refresh_token: `ghr_new${n}`, refresh_token_expires_in: 15811200, token_type: "bearer", scope: "" });
    }
    // first exchange: access token already "expired" (1s < 5s margin) to force a refresh
    return json({ access_token: "ghu_first", expires_in: 1, refresh_token: "ghr_first", refresh_token_expires_in: 15811200, token_type: "bearer", scope: "" });
  }
  if (url === "https://api.github.com/user") return json({ id: 42, login: "octo", name: "Octo", email: withEmail ? "octo@example.com" : null, avatar_url: "x" });
  if (url === "https://api.github.com/user/emails") return withEmail ? json([{ email: "octo@example.com", primary: true, verified: true }]) : json({ message: "Resource not accessible by integration" }, 403);
  return realFetch(input, init);
};

const db = { user: [], session: [], account: [], verification: [] };
const auth = betterAuth({
  baseURL: "http://localhost:3000",
  secret: "x".repeat(32),
  database: memoryAdapter(db),
  socialProviders: { github: { clientId: "Iv1.test", clientSecret: "secret" } },
  account: { encryptOAuthTokens: true },
});

async function signIn() {
  const r = await auth.api.signInSocial({ body: { provider: "github", callbackURL: "/" }, asResponse: true });
  const { url } = await r.json();
  const state = new URL(url).searchParams.get("state");
  const cookies = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const cb = await auth.handler(new Request(`http://localhost:3000/api/auth/callback/github?code=abc&state=${state}`, { headers: { cookie: cookies } }));
  return { cb, cookie: cb.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

// 1. sign in
const { cb, cookie } = await signIn();
assert.equal(cb.status, 302);
assert.ok(!String(cb.headers.get("location")).includes("error"), "sign-in failed: " + cb.headers.get("location"));
const acct = { ...db.account[0] };
assert.ok(acct.refreshToken && acct.refreshToken !== "ghr_first", "refresh token stored encrypted");
assert.ok(acct.refreshTokenExpiresAt, "refresh token expiry stored");
console.log("ok  sign-in stores encrypted access+refresh tokens and both expiries");

// 2. refresh with rotation
const headers = new Headers({ cookie });
const ACC = db.account[0].id;
const t1 = await auth.api.getAccessToken({ body: { accountId: ACC }, headers });
assert.equal(t1.accessToken, "ghu_new1");
assert.equal(tokenCalls.at(-1).refresh_token, "ghr_first");
assert.equal(tokenCalls.at(-1).grant_type, "refresh_token");
assert.notEqual(db.account[0].refreshToken, acct.refreshToken, "rotated refresh token persisted");
console.log("ok  expired access token refreshed, rotated refresh token persisted");

// 3. valid token: no new refresh
const before = tokenCalls.length;
const t2 = await auth.api.getAccessToken({ body: { accountId: ACC }, headers });
assert.equal(t2.accessToken, "ghu_new1");
assert.equal(tokenCalls.length, before);
console.log("ok  valid token served without hitting GitHub");

// 4. failure: GitHub answers 200 + error body
db.account[0].accessTokenExpiresAt = new Date(Date.now() - 1000);
refreshMode = "bad";
await assert.rejects(auth.api.getAccessToken({ body: { accountId: ACC }, headers }), (e) => e.body?.code === "FAILED_TO_GET_ACCESS_TOKEN");
console.log("ok  failed refresh surfaces FAILED_TO_GET_ACCESS_TOKEN (hub must suspend sessions on it)");

// 5. concurrency: two parallel refreshes with the same single-use refresh token
refreshMode = "ok";
db.account[0].accessTokenExpiresAt = new Date(Date.now() - 1000);
const res = await Promise.allSettled([
  auth.api.getAccessToken({ body: { accountId: ACC }, headers }),
  auth.api.getAccessToken({ body: { accountId: ACC }, headers }),
]);
console.log("info parallel refresh:", res.map((r) => r.status).join(", "), "-> need a per-account lock/single-flight");

// 6. GitHub App without the "Email addresses" permission
withEmail = false;
db.user.length = 0; db.account.length = 0; db.session.length = 0;
const noMail = await signIn();
console.log("info sign-in without email ->", noMail.cb.headers.get("location"));
