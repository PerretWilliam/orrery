import { describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));

import config, { LOCALE } from "./request";

describe("i18n request config", () => {
  it("serves the English catalog only", async () => {
    const result = await (config as unknown as () => Promise<unknown>)();
    expect(LOCALE).toBe("en");
    expect(result).toEqual({ locale: "en", messages });
  });
});
