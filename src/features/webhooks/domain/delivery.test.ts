import { describe, expect, it } from "vitest";
import { parseDeliveryHeaders } from "./delivery";

const headers = (event?: string, delivery?: string) => {
  const h = new Headers();
  if (event !== undefined) h.set("x-github-event", event);
  if (delivery !== undefined) h.set("x-github-delivery", delivery);
  return h;
};

describe("parseDeliveryHeaders", () => {
  it("reads the event and the delivery id", () => {
    expect(parseDeliveryHeaders(headers("installation_repositories", "72d3162e-cc78-11e3-81ab-4c9367dc0958"))).toEqual({
      event: "installation_repositories",
      deliveryId: "72d3162e-cc78-11e3-81ab-4c9367dc0958",
    });
  });
  it.each([undefined, "", "Member", "member x", "member;drop", "a".repeat(65)])("refuses the event %j", (event) => {
    expect(parseDeliveryHeaders(headers(event, "abc-123"))).toMatchObject({ code: "webhook_headers_invalid", path: "headers.x-github-event", message: "The event name is missing or malformed.", fix: expect.any(String) });
  });
  it.each([undefined, "", "a b", "a'; --", "x".repeat(65), "été"])("refuses the delivery id %j", (id) => {
    expect(parseDeliveryHeaders(headers("member", id))).toMatchObject({ code: "webhook_headers_invalid", path: "headers.x-github-delivery", message: "The delivery id is missing or malformed." });
  });
  it("accepts the longest allowed values", () => {
    expect(parseDeliveryHeaders(headers("a".repeat(64), "9".repeat(64)))).toEqual({ event: "a".repeat(64), deliveryId: "9".repeat(64) });
  });
});
