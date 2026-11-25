// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "./parse-config";
import { WIDGET_TYPES } from "./schema-v1";

describe("the project of `npm run demo`", () => {
  it("is a valid file with a widget of every type", () => {
    const result = parseConfig(readFileSync("scripts/demo/hub.yml", "utf8"));
    expect(result).toMatchObject({ ok: true });
    const types = result.ok ? result.config.pages.flatMap((page) => page.widgets.map((widget) => widget.type)) : [];
    expect(new Set(types)).toEqual(new Set(WIDGET_TYPES));
  });
});
