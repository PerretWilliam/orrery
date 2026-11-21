// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const authenticatedMutation = vi.fn();
const startSignIn = vi.fn();
vi.mock("@/features/auth/server/route-guard", () => ({ authenticatedMutation: (request: Request) => authenticatedMutation(request) }));
vi.mock("@/features/auth/server/http", () => ({ startSignIn: (auth: unknown, headers: Headers) => startSignIn(auth, headers) }));

import { POST } from "./route";

afterEach(() => vi.clearAllMocks());
const request = new Request("http://hub.test/auth/sign-in", { method: "POST", headers: { origin: "http://hub.test" } });

describe("POST /auth/sign-in", () => {
  it("answers with the guard's response when the request is refused", async () => {
    const refusal = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ response: refusal });
    expect(await POST(request)).toBe(refusal);
    expect(startSignIn).not.toHaveBeenCalled();
  });
  it("starts the GitHub sign-in with the request's headers otherwise", async () => {
    const redirect = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ context: { auth: "auth" } });
    startSignIn.mockResolvedValue(redirect);
    expect(await POST(request)).toBe(redirect);
    expect(startSignIn).toHaveBeenCalledWith("auth", request.headers);
  });
});
