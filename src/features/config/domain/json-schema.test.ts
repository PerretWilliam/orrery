import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configJsonSchema } from "./json-schema";

const PUBLISHED = join(process.cwd(), "public/schema/hub-v1.json");
const render = () => `${JSON.stringify(configJsonSchema(), null, 2)}\n`;

describe("published JSON Schema", () => {
  // Regenerate with `npm run schema:generate`.
  it("is up to date with the Zod schema", () => {
    if (process.env.UPDATE_SCHEMA) writeFileSync(PUBLISHED, render());
    expect(readFileSync(PUBLISHED, "utf8")).toBe(render());
  });

  it("describes version 1 and forbids unknown fields", () => {
    const schema = configJsonSchema() as { $schema: string; title: string; additionalProperties: boolean; required: string[]; properties: Record<string, { const?: number }> };
    expect(schema.$schema).toContain("2020-12");
    expect(schema.title).toBe("Orrery .hub.yml, version 1");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["version", "project", "pages"]);
    expect(schema.properties.version.const).toBe(1);
  });
});
