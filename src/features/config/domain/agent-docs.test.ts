import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_ERRORS } from "@/features/api/domain/errors";
import { CONFIG_ERRORS } from "./errors";
import { WIDGET_TYPES } from "./schema-v1";

const guide = readFileSync("docs/agents.md", "utf8");

describe("docs/agents.md", () => {
  it.each(WIDGET_TYPES)("documents the widget type %s", (type) =>
    expect(guide).toContain(`\`${type}\``),
  );
  it.each([...Object.keys(CONFIG_ERRORS), ...Object.keys(API_ERRORS)])(
    "lists the error code %s",
    (code) => expect(guide).toContain(`\`${code}\``),
  );
  it("is linked from llms.txt and the skill exists", () => {
    expect(readFileSync("public/llms.txt", "utf8")).toContain("docs/agents.md");
    expect(readFileSync("skills/orrery-hub-yml/SKILL.md", "utf8")).toMatch(
      /^name: orrery-hub-yml$/m,
    );
  });
});
