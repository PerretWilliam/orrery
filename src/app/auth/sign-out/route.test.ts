// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const authenticatedMutation = vi.fn();
const endSession = vi.fn();
vi.mock("@/features/auth/server/route-guard", () => ({ authenticatedMutation: (request: Request) => authenticatedMutation(request) }));
vi.mock("@/features/auth/server/http", () => ({ endSession: (auth: unknown, headers: Headers) => endSession(auth, headers) }));

const currentViewer = vi.fn();
const record = vi.fn();
vi.mock("@/features/auth/server/runtime", () => ({ currentViewer: (headers: Headers) => currentViewer(headers) }));
vi.mock("@/features/audit/server/runtime", () => ({ getAudit: () => ({ record }) }));

import { POST } from "./route";

afterEach(() => vi.clearAllMocks());
const request = new Request("http://hub.test/auth/sign-out", { method: "POST", headers: { origin: "http://hub.test" } });

describe("POST /auth/sign-out", () => {
  it("answers with the guard's response when the request is refused", async () => {
    const refusal = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ response: refusal });
    expect(await POST(request)).toBe(refusal);
    expect(endSession).not.toHaveBeenCalled();
  });
  it("ends the session with the request's headers otherwise, after noting who signed out", async () => {
    const redirect = new Response(null, { status: 303 });
    authenticatedMutation.mockResolvedValue({ context: { auth: "auth" } });
    currentViewer.mockResolvedValue({ userId: "u1", login: "octo" });
    endSession.mockResolvedValue(redirect);
    expect(await POST(request)).toBe(redirect);
    expect(endSession).toHaveBeenCalledWith("auth", request.headers);
    expect(record).toHaveBeenCalledWith({ event: "sign_out", actor: "octo" });
  });
  it("signs out without an entry when nobody is signed in", async () => {
    authenticatedMutation.mockResolvedValue({ context: { auth: "auth" } });
    currentViewer.mockResolvedValue(null);
    endSession.mockResolvedValue(new Response(null, { status: 303 }));
    await POST(request);
    expect(record).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalled();
  });
});
