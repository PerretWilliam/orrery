import type { ConfigIssue } from "@/features/config/domain/errors";
import { ConfigV1 } from "@/features/config/domain/schema-v1";
import type { RepoRef } from "../domain/git-provider";

/** A repository as the shell needs it. `config` is as stored (jsonb): it is checked again before use. */
export type ProjectRow = {
  owner: string;
  name: string;
  isPrivate: boolean;
  archived: boolean;
  config: unknown;
  issues: ConfigIssue[] | null;
};

export type ProjectStore = {
  /** Repositories that have a config file (valid or not). */
  listConfigured(): Promise<ProjectRow[]>;
  view(repo: RepoRef): Promise<ProjectRow | null>;
};

export type Project = {
  owner: string;
  name: string;
  isPrivate: boolean;
  archived: boolean;
  title: string;
  color: string | null;
  /** The last valid config; `null` when the file has never been valid. */
  config: ConfigV1 | null;
  issues: ConfigIssue[];
};

function toProject(row: ProjectRow): Project {
  const parsed = ConfigV1.safeParse(row.config);
  const config = parsed.success ? parsed.data : null;
  return {
    owner: row.owner,
    name: row.name,
    isPrivate: row.isPrivate,
    archived: row.archived,
    title: config?.project.name ?? row.name,
    color: config?.project.color ?? null,
    config,
    issues: row.issues ?? [],
  };
}

export type ProjectsDeps = {
  store: ProjectStore;
  /** The access policy: GitHub's permission, narrowed by the admin's rules. Fails closed. */
  canView: (repo: RepoRef, login: string) => Promise<boolean>;
};

export function createProjects({ store, canView }: ProjectsDeps) {
  return {
    /** The projects this user may see, by title. */
    async visibleTo(login: string): Promise<Project[]> {
      const rows = await store.listConfigured();
      const visible = await Promise.all(rows.map(async (row) => ((await canView(row, login)) ? [row] : [])));
      return visible
        .flat()
        .map(toProject)
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    /** One project, or `null` when it does not exist or the user may not see it: the two look the same. */
    async open(repo: RepoRef, login: string): Promise<Project | null> {
      const row = await store.view(repo);
      return row && (await canView(row, login)) ? toProject(row) : null;
    },
  };
}
export type Projects = ReturnType<typeof createProjects>;
