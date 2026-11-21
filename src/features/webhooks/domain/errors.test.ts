import { describe, expect, it } from "vitest";
import { WEBHOOK_ERRORS, WEBHOOK_STATUS, webhookIssue } from "./errors";

describe("webhook error catalog", () => {
  it("has a status and a fix for every code", () => {
    expect(Object.keys(WEBHOOK_STATUS).sort()).toEqual(Object.keys(WEBHOOK_ERRORS).sort());
    for (const code of Object.keys(WEBHOOK_ERRORS) as (keyof typeof WEBHOOK_ERRORS)[]) {
      expect(webhookIssue(code, "$", "m")).toEqual({ code, path: "$", message: "m", fix: Reflect.get(WEBHOOK_ERRORS, code).fix });
    }
  });
  it("pins the released codes", () => {
    expect(Object.keys(WEBHOOK_ERRORS)).toEqual([
      "webhook_not_configured",
      "webhook_signature_invalid",
      "webhook_headers_invalid",
      "webhook_payload_too_large",
      "webhook_payload_invalid",
    ]);
    expect(WEBHOOK_STATUS).toEqual({
      webhook_not_configured: 503,
      webhook_signature_invalid: 401,
      webhook_headers_invalid: 400,
      webhook_payload_too_large: 413,
      webhook_payload_invalid: 400,
    });
  });
});
