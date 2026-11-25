// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ACTIVITY_TTL_MS, GITHUB_UNAVAILABLE, MAX_CACHED, createActivity } from "./activity";

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

const repo = { owner: "Acme", name: "Web" };
const request = { kind: "releases", limit: 5 } as const;
const item = (key: string) => ({ key, title: key, state: "released", by: null, url: "", at: null });
const setup = (answers: (() => unknown)[]) => {
  const clock = { t: 1_000 };
  const getActivity = vi.fn(async () => {
    const next = answers.shift();
    if (!next) throw new Error("no answer");
    return next();
  });
  return { clock, getActivity, activity: createActivity({ git: { getActivity } as never, now: () => clock.t }) };
};
const found = (keys: string[], etag = "e1") => () => ({ kind: "found", items: keys.map(item), etag });

describe("activity", () => {
  it("asks GitHub once, then serves the list from memory for a minute, whatever the case of the repository", async () => {
    const { activity, getActivity, clock } = setup([found(["v1"])]);
    expect(await activity.load(repo, request)).toEqual({ ok: true, items: [item("v1")], fetchedAt: new Date(1_000), stale: false });
    clock.t += ACTIVITY_TTL_MS - 1;
    await activity.load({ owner: "acme", name: "web" }, request);
    expect(getActivity).toHaveBeenCalledTimes(1);
  });
  it("asks again with the ETag after the minute, and a 304 keeps the list and renews its age", async () => {
    const { activity, getActivity, clock } = setup([found(["v1"], "e1"), () => ({ kind: "unchanged" })]);
    await activity.load(repo, request);
    clock.t += ACTIVITY_TTL_MS;
    expect(await activity.load(repo, request)).toEqual({ ok: true, items: [item("v1")], fetchedAt: new Date(1_000 + ACTIVITY_TTL_MS), stale: false });
    expect(getActivity).toHaveBeenLastCalledWith(repo, request, "e1");
  });
  it("sends no ETag when the first answer had none, and takes a changed list", async () => {
    const { activity, getActivity, clock } = setup([found(["v1"], ""), found(["v2"], "e2")]);
    await activity.load(repo, request);
    clock.t += ACTIVITY_TTL_MS;
    expect((await activity.load(repo, request))).toMatchObject({ items: [item("v2")] });
    expect(getActivity).toHaveBeenNthCalledWith(2, repo, request, undefined);
  });
  it("shows the last list as stale when GitHub fails, and the structured error when there is none", async () => {
    const { activity, clock } = setup([found(["v1"]), () => { throw new Error("boom"); }]);
    await activity.load(repo, request);
    clock.t += ACTIVITY_TTL_MS;
    expect(await activity.load(repo, request)).toMatchObject({ ok: true, stale: true, items: [item("v1")] });
    expect(await setup([() => { throw new Error("x"); }]).activity.load(repo, request)).toEqual({ ok: false, errors: [GITHUB_UNAVAILABLE] });
    expect(await setup([() => { throw "not an error"; }]).activity.load(repo, request)).toMatchObject({ ok: false });
  });
  it("treats an unchanged answer to a request without ETag as a failure", async () => {
    expect(await setup([() => ({ kind: "unchanged" })]).activity.load(repo, request)).toEqual({ ok: false, errors: [GITHUB_UNAVAILABLE] });
  });
  it("shares one request between concurrent askers, and forgets it afterwards", async () => {
    const { activity, getActivity } = setup([found(["v1"])]);
    const [a, b] = await Promise.all([activity.load(repo, request), activity.load(repo, request)]);
    expect(a).toBe(b);
    expect(getActivity).toHaveBeenCalledTimes(1);
  });
  it("keeps a bounded number of lists, dropping the oldest", async () => {
    const answers = Array.from({ length: MAX_CACHED + 2 }, () => found(["v"]));
    const { activity, getActivity } = setup(answers);
    for (let i = 0; i < MAX_CACHED + 1; i++) await activity.load(repo, { kind: "releases", limit: i + 1 });
    getActivity.mockClear();
    await activity.load(repo, { kind: "releases", limit: MAX_CACHED + 1 });
    expect(getActivity).not.toHaveBeenCalled();
    await activity.load(repo, { kind: "releases", limit: 1 });
    expect(getActivity).toHaveBeenCalledTimes(1);
  });
});
