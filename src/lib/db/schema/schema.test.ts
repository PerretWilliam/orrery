import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { is, Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from ".";

const tables = Object.values(schema).filter((v) => is(v, Table)) as unknown as PgTable[];
const byName = (name: string) => {
  const t = tables.find((x) => getTableConfig(x).name === name);
  if (!t) throw new Error(`no table ${name}`);
  return getTableConfig(t);
};

// Audit columns that point at users purely for attribution (ON DELETE SET NULL on small admin tables).
const ATTRIBUTION_COLUMNS = new Set(["created_by", "added_by"]);

describe("schema design rules", () => {
  it("declares every expected table", () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual(
      [
        "account", "agent_tokens", "audit_log", "github_installations", "http_cache", "instance_admins",
        "instance_allowed_hosts", "instance_settings", "permission_cache", "project_allowed_hosts", "project_rules",
        "repositories", "secrets", "session", "sign_in_allowlist", "user", "verification", "webhook_deliveries",
      ].sort(),
    );
  });

  it("indexes the leading column of every foreign key", () => {
    for (const t of tables) {
      const cfg = getTableConfig(t);
      const leading = new Set<string>();
      for (const pk of cfg.primaryKeys) leading.add(pk.columns[0].name);
      for (const c of cfg.columns) if (c.primary) leading.add(c.name);
      for (const u of cfg.uniqueConstraints) leading.add(u.columns[0].name);
      for (const i of cfg.indexes) {
        const first = i.config.columns[0];
        if ("name" in first && first.name) leading.add(first.name);
      }
      for (const fk of cfg.foreignKeys) {
        const col = fk.reference().columns[0].name;
        if (ATTRIBUTION_COLUMNS.has(col)) continue;
        expect(leading, `${cfg.name}.${col} has no index`).toContain(col);
      }
    }
  });

  it("makes cached secrets and tokens unique by hash or name", () => {
    const uniques = (name: string) => byName(name).indexes.filter((i) => i.config.unique).map((i) => i.config.name ?? "");
    expect(uniques("agent_tokens")).toContain("agent_tokens_hash_uq");
    expect(uniques("secrets")).toContain("secrets_repository_name_uq");
    expect(uniques("repositories")).toEqual(expect.arrayContaining(["repositories_github_id_uq", "repositories_full_name_uq"]));
  });

  it("guards invariants with check constraints", () => {
    const checks = (name: string) => byName(name).checks.map((c) => c.name);
    expect(checks("secrets")).toContain("secrets_bound_hosts_not_empty");
    expect(checks("agent_tokens")).toContain("agent_tokens_max_one_year");
    expect(checks("instance_settings")).toEqual(expect.arrayContaining(["instance_settings_singleton", "instance_settings_poll_min"]));
    expect(checks("project_rules")).toContain("project_rules_subject_shape");
  });
});
