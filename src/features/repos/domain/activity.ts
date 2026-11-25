/** What the GitHub widgets ask a Git host for, and what they get back. Provider-agnostic, read-only. */
export type ActivityKind = "issues" | "pull_requests" | "workflow_runs" | "releases";

export type ActivityRequest = {
  kind: ActivityKind;
  /** Issues and pull requests only. */
  state?: "open" | "closed" | "all";
  /** Workflow runs only. */
  branch?: string;
  limit: number;
};

/** One line of a list. Every field is text from the host: untrusted, rendered as text, never as markup. */
export type ActivityItem = {
  /** Short identifier: `#12`, a release tag, a workflow name. */
  key: string;
  title: string;
  /** `open`, `merged`, `success`, `prerelease`… as the host says it. */
  state: string;
  by: string | null;
  /** A link on the host, or `""` when the host sent none we trust. */
  url: string;
  /** ISO date of the last change. */
  at: string | null;
};

/** `unchanged`: the ETag the caller sent still matches. */
export type ActivityResult = { kind: "found"; items: ActivityItem[]; etag: string } | { kind: "unchanged" };
