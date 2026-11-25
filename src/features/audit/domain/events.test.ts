import { describe, expect, it } from "vitest";
import { AUDIT_EVENTS, cleanDetail, isAuditEvent } from "./events";

describe("audit events", () => {
  it("knows its events, and nothing else", () => {
    for (const name of AUDIT_EVENTS) expect(isAuditEvent(name)).toBe(true);
    for (const bad of ["login", "", null, 3]) expect(isAuditEvent(bad)).toBe(false);
  });
  it("keeps detail small: at most 8 short fields", () => {
    expect(cleanDetail(undefined)).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, "v"]));
    expect(Object.keys(cleanDetail(many))).toHaveLength(8);
    expect(cleanDetail({ ["k".repeat(60)]: "v".repeat(500) })).toEqual({ ["k".repeat(40)]: "v".repeat(200) });
  });
});
