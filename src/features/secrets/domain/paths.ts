/** Where a project's secret settings live. Names are encoded: they come from the URL and from GitHub, never trusted as a path. */
export const secretsPath = (project: { owner: string; name: string }, query = ""): string =>
  `/settings/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.name)}/secrets${query}`;
