import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guide = readFileSync("docs/guide.md", "utf8");

describe("docs/guide.md", () => {
  it.each([
    "DATABASE_URL",
    "ORRERY_ENCRYPTION_KEYS",
    "ORRERY_PUBLIC_URL",
    "ORRERY_SETUP_TOKEN",
    "ORRERY_ADMINS",
    "ORRERY_SIGNIN_ALLOWLIST",
    "pg_dump",
    "pg_restore",
  ])("covers %s", (term) => expect(guide).toContain(term));
});
