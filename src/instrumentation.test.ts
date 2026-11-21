// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const startInstance = vi.fn(async () => undefined);
vi.mock("@/features/setup/server/start", () => ({ startInstance: () => startInstance() }));

import { register } from "./instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
  startInstance.mockClear();
});

describe("register", () => {
  it("starts the instance on the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(startInstance).toHaveBeenCalledTimes(1);
  });
  it("does nothing on the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(startInstance).not.toHaveBeenCalled();
  });
});
