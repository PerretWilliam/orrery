import { describe, expect, it } from "vitest";
import { WIDGET_TYPES } from "@/features/config/domain/schema-v1";
import { LOADERS, widgetComponent } from "./registry";

describe("widget registry", () => {
  it("covers exactly the widget types of the schema, so a new type never needs a parser change", () => {
    expect(Object.keys(LOADERS).sort()).toEqual([...WIDGET_TYPES].sort());
  });
  it("loads a component for every type", async () => {
    for (const load of Object.values(LOADERS)) expect(typeof (await load()).default).toBe("function");
  });
  it("hands out one lazy component per type, always the same", () => {
    expect(widgetComponent("kpi")).toBe(widgetComponent("kpi"));
    expect(widgetComponent("kpi")).not.toBe(widgetComponent("line"));
  });
});
