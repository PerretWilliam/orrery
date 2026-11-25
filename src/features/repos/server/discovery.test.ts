// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileResult, RepoRef, RepoSummary } from "../domain/git-provider";
import { CONCURRENCY, createDiscovery } from "./discovery";
import type { ConfigState, RepoStore, StoredRepo } from "./store";

const NOW = new Date("2026-06-01T00:00:00Z");
const VALID = `version: 1
project:
  name: Starfall
sources:
  stats:
    url: https://api.starfall.example/stats
pages:
  - id: overview
    title: Overview
    widgets:
      - type: kpi
        source: stats
        path: data.x
        label: X
`;
const INVALID = "version: 1\nproject: {}\n";

const summary = (id: number, over: Partial<RepoSummary> = {}): RepoSummary => ({ githubId: id, installationId: 1, owner: "acme", name: `r${id}`, defaultBranch: "main", isPrivate: true, archived: false, ...over });

type Files = Record<string, Record<string, { content: string; etag: string; sha: string }>>;

function setup({ repos = [summary(1)], files = {} as Files, stored = new Map<number, StoredRepo>() } = {}) {
  const saved: { repo: RepoSummary; state: ConfigState }[] = [];
  const asked: { repo: string; path: string; etag: string | undefined }[] = [];
  const installations = [{ id: 1, accountLogin: "acme", accountType: "Organization", suspended: false }];
  const git = {
    listInstallations: vi.fn(async () => installations),
    listRepositories: vi.fn(async () => repos),
    getFile: vi.fn(async (repo: RepoRef, path: string, etag?: string): Promise<FileResult> => {
      asked.push({ repo: repo.name, path, etag });
      const file = Reflect.get(files[repo.name] ?? {}, path) as Files[string][string] | undefined;
      if (!file) return { kind: "absent" };
      return etag && etag === file.etag ? { kind: "unchanged" } : { kind: "found", ...file };
    }),
  };
  const store = {
    saveInstallations: vi.fn(async () => undefined),
    stored: vi.fn(async () => stored),
    find: vi.fn(async (repo: RepoRef) => {
      const row = repos.find((r) => r.name === repo.name);
      return row ? { summary: row, stored: stored.get(row.githubId) ?? { configFile: null, configEtag: null, configSha: null, configIssues: null } } : null;
    }),
    save: vi.fn(async (repo: RepoSummary, state: ConfigState) => void saved.push({ repo, state })),
    clearUnseen: vi.fn(async () => undefined),
  } satisfies Omit<RepoStore, "credentials" | "settings">;
  return { discovery: createDiscovery({ git, store, now: () => NOW }), git, store, saved, asked };
}

const file = (content: string, etag = "e1", sha = "s1") => ({ content, etag, sha });
const quiet = () => vi.spyOn(process.stdout, "write").mockReturnValue(true);
afterEach(() => vi.restoreAllMocks());

describe("syncAll", () => {
  it("records the installations, then the config of each repository, then forgets the repositories that are gone", async () => {
    const { discovery, store, saved } = setup({ repos: [summary(1), summary(2)], files: { r1: { ".hub.yml": file(VALID) } } });
    expect(await discovery.syncAll()).toEqual({ checked: 2, failed: 0 });
    expect(store.saveInstallations).toHaveBeenCalledWith([{ id: 1, accountLogin: "acme", accountType: "Organization", suspended: false }], NOW);
    expect(saved[0]).toMatchObject({
      repo: { githubId: 1 },
      state: { configFile: ".hub.yml", configEtag: "e1", configSha: "s1", configIssues: null, lastValidConfig: { project: { name: "Starfall" } } },
    });
    expect(saved[1].state).toEqual({ configFile: null, configEtag: null, configSha: null, configIssues: null, lastValidConfig: null });
    expect(store.clearUnseen).toHaveBeenCalledWith([1, 2], NOW);
  });

  it("keeps the last valid config and records the issues when the file is invalid", async () => {
    const { discovery, saved } = setup({ files: { r1: { ".hub.yml": file(INVALID) } } });
    await discovery.syncAll();
    expect(saved[0].state.lastValidConfig).toBeUndefined();
    expect(saved[0].state.configFile).toBe(".hub.yml");
    expect(saved[0].state.configIssues?.length).toBeGreaterThan(0);
  });

  it("reads .repo-hub.yml when it is the only one", async () => {
    const { discovery, saved } = setup({ files: { r1: { ".repo-hub.yml": file(VALID, "e2", "s2") } } });
    await discovery.syncAll();
    expect(saved[0].state).toMatchObject({ configFile: ".repo-hub.yml", configEtag: "e2", configSha: "s2" });
  });

  it("prefers .hub.yml and warns when both exist", async () => {
    const { discovery, saved } = setup({ files: { r1: { ".hub.yml": file(VALID), ".repo-hub.yml": file(INVALID, "e9", "s9") } } });
    await discovery.syncAll();
    expect(saved[0].state.configFile).toBe(".hub.yml");
    expect(saved[0].state.lastValidConfig).toMatchObject({ project: { name: "Starfall" } });
    expect(saved[0].state.configIssues?.map((issue) => issue.code)).toEqual(["config_duplicate_file"]);
  });

  it("adds the warning to the parse issues", async () => {
    const { discovery, saved } = setup({ files: { r1: { ".hub.yml": file(INVALID), ".repo-hub.yml": file(VALID) } } });
    await discovery.syncAll();
    expect(saved[0].state.configIssues?.at(-1)?.code).toBe("config_duplicate_file");
    expect(saved[0].state.configIssues?.length).toBeGreaterThan(1);
  });

  describe("on a second look", () => {
    const stored = (over: Partial<StoredRepo> = {}) => new Map([[1, { configFile: ".hub.yml" as const, configEtag: "e1", configSha: "s1", configIssues: null, ...over }]]);

    it("asks with the ETag of the file it stored and does not parse an unchanged file again", async () => {
      const { discovery, saved, asked } = setup({ files: { r1: { ".hub.yml": file(VALID) } }, stored: stored() });
      await discovery.syncAll();
      expect(asked).toEqual([
        { repo: "r1", path: ".hub.yml", etag: "e1" },
        { repo: "r1", path: ".repo-hub.yml", etag: undefined },
      ]);
      expect(saved[0].state).toEqual({ configFile: ".hub.yml", configEtag: "e1", configSha: "s1", configIssues: null, lastValidConfig: undefined });
    });
    it("sends no condition for a file it has not stored, nor an empty ETag", async () => {
      const { discovery, asked } = setup({ files: {}, stored: stored({ configFile: ".repo-hub.yml", configEtag: null }) });
      await discovery.syncAll();
      expect(asked.map((a) => a.etag)).toEqual([undefined, undefined]);
    });
    it("keeps the parse issues of an unchanged file and follows the warning about the second file", async () => {
      const issue = { code: "config_required" as const, path: "project.name", message: "Required", fix: "Add it." };
      const files = { r1: { ".hub.yml": file(INVALID) } };
      const first = setup({ files, stored: stored({ configIssues: [issue] }) });
      await first.discovery.syncAll();
      expect(first.saved[0].state.configIssues).toEqual([issue]);

      const second = setup({ files: { r1: { ...files.r1, ".repo-hub.yml": file(VALID, "e3") } }, stored: stored({ configIssues: [issue] }) });
      await second.discovery.syncAll();
      expect(second.saved[0].state.configIssues?.map((i) => i.code)).toEqual(["config_required", "config_duplicate_file"]);

      const warned = [issue, { code: "config_duplicate_file" as const, path: "$", message: "m", fix: "f" }];
      const third = setup({ files, stored: stored({ configIssues: warned }) });
      await third.discovery.syncAll();
      expect(third.saved[0].state.configIssues).toEqual([issue]);
    });
    it("forgets the config when the file is gone", async () => {
      const { discovery, saved } = setup({ files: {}, stored: stored() });
      await discovery.syncAll();
      expect(saved[0].state).toEqual({ configFile: null, configEtag: null, configSha: null, configIssues: null, lastValidConfig: null });
    });
    it("reads the other file in full when the stored one is replaced by it", async () => {
      const { discovery, saved } = setup({ files: { r1: { ".repo-hub.yml": file(VALID, "e5", "s5") } }, stored: stored() });
      await discovery.syncAll();
      expect(saved[0].state).toMatchObject({ configFile: ".repo-hub.yml", configEtag: "e5", configSha: "s5" });
    });
  });

  it("carries on when one repository fails, counts it, and still keeps it in the seen list", async () => {
    const log = quiet();
    const { discovery, git, saved, store } = setup({ repos: [summary(1), summary(2)], files: { r2: { ".hub.yml": file(VALID) } } });
    git.getFile.mockImplementation(async (repo: RepoRef) => {
      if (repo.name === "r1") throw new Error("rate limited");
      return { kind: "absent" };
    });
    expect(await discovery.syncAll()).toEqual({ checked: 1, failed: 1 });
    expect(saved.map((s) => s.repo.githubId)).toEqual([2]);
    expect(store.clearUnseen).toHaveBeenCalledWith([1, 2], NOW);
    expect(log.mock.calls.join("")).toContain("rate limited");
  });

  it("logs a failure that is not an Error without inventing a message", async () => {
    const log = quiet();
    const { discovery, git } = setup();
    git.getFile.mockRejectedValue("nope");
    await discovery.syncAll();
    expect(log.mock.calls.join("")).toContain("unknown error");
  });

  it("changes nothing when the repositories cannot be listed", async () => {
    const { discovery, git, store, saved } = setup();
    git.listRepositories.mockRejectedValue(new Error("GitHub is down"));
    await expect(discovery.syncAll()).rejects.toThrow("GitHub is down");
    expect(saved).toEqual([]);
    expect(store.saveInstallations).not.toHaveBeenCalled();
    expect(store.clearUnseen).not.toHaveBeenCalled();
  });

  it("looks at a few repositories at a time", async () => {
    const repos = Array.from({ length: CONCURRENCY * 2 + 1 }, (_, i) => summary(i + 1));
    const { discovery, git } = setup({ repos });
    let running = 0;
    let peak = 0;
    git.getFile.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return { kind: "absent" };
    });
    expect(await discovery.syncAll()).toEqual({ checked: repos.length, failed: 0 });
    expect(peak).toBe(CONCURRENCY * 2);
  });
});

describe("runs", () => {
  it("never overlap, and callers who ask while one is waiting share it", async () => {
    const { discovery, git } = setup();
    let release = () => {};
    git.listRepositories.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve([]))));
    const first = discovery.syncAll();
    await vi.waitFor(() => expect(git.listRepositories).toHaveBeenCalledTimes(1));
    const second = discovery.syncAll();
    const third = discovery.syncAll();
    expect(second).toBe(third);
    expect(second).not.toBe(first);
    expect(git.listRepositories).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second, third]);
    expect(git.listRepositories).toHaveBeenCalledTimes(2);
    expect(discovery.syncAll()).not.toBe(second);
  });

  it("go on after one failed", async () => {
    const { discovery, git } = setup();
    git.listRepositories.mockRejectedValueOnce(new Error("down"));
    await expect(discovery.syncAll()).rejects.toThrow("down");
    expect(await discovery.syncAll()).toEqual({ checked: 1, failed: 0 });
  });
});

describe("refresh", () => {
  it("looks at one repository only, with the ETag it stored", async () => {
    const stored = new Map([[1, { configFile: ".hub.yml" as const, configEtag: "e1", configSha: "s1", configIssues: null }]]);
    const { discovery, git, saved, asked } = setup({ repos: [summary(1), summary(2)], files: { r1: { ".hub.yml": file(VALID, "e2", "s2") } }, stored });
    expect(await discovery.refresh({ owner: "acme", name: "r1" })).toEqual({ checked: 1, failed: 0 });
    expect(git.listRepositories).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
    expect(asked[0]).toEqual({ repo: "r1", path: ".hub.yml", etag: "e1" });
    expect(saved[0].state.configEtag).toBe("e2");
  });
  it("forgets the stored ETag when forced, so an unchanged file is read and parsed again", async () => {
    const stored = new Map([[1, { configFile: ".hub.yml" as const, configEtag: "e1", configSha: "s1", configIssues: null }]]);
    const { discovery, saved, asked } = setup({ repos: [summary(1)], files: { r1: { ".hub.yml": file(VALID, "e1", "s1") } }, stored });
    await discovery.refresh({ owner: "acme", name: "r1" }, { force: true });
    expect(asked[0].etag).toBeUndefined();
    expect(saved[0].state.configSha).toBe("s1");
  });
  it("looks at everything when the repository is new to the hub", async () => {
    const { discovery, git } = setup({ repos: [summary(1)] });
    expect(await discovery.refresh({ owner: "acme", name: "brand-new" })).toEqual({ checked: 1, failed: 0 });
    expect(git.listRepositories).toHaveBeenCalledTimes(1);
  });
  it("waits for the run in progress", async () => {
    const { discovery, git, store } = setup({ repos: [summary(1)] });
    let release = () => {};
    git.listRepositories.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve([]))));
    const running = discovery.syncAll();
    await vi.waitFor(() => expect(git.listRepositories).toHaveBeenCalledTimes(1));
    const refreshed = discovery.refresh({ owner: "acme", name: "r1" });
    expect(store.find).not.toHaveBeenCalled();
    release();
    await Promise.all([running, refreshed]);
    expect(store.find).toHaveBeenCalledTimes(1);
  });
});
