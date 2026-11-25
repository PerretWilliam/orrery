import { describe, expect, it } from "vitest";
import { SOURCE_ERRORS, SourceError } from "./source-error";

describe("SOURCE_ERRORS", () => {
  it("pins the stable list of codes", () => {
    expect(Object.keys(SOURCE_ERRORS)).toEqual([
      "source_bad_status",
      "source_content_type",
      "source_too_large",
      "source_timeout",
      "source_invalid_json",
      "source_internal",
      "source_unreachable",
    ]);
  });
  it.each(Object.entries(SOURCE_ERRORS))(
    "%s has a message and a suggested fix",
    (code, { message, fix }) => {
      const error = new SourceError(code as keyof typeof SOURCE_ERRORS);
      expect(error).toMatchObject({ code, name: "SourceError", message, fix });
      expect(message.length).toBeGreaterThan(10);
      expect(fix.length).toBeGreaterThan(10);
    },
  );
});
