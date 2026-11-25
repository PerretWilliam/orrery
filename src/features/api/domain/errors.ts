/** Error catalog of the REST API. Stable codes: never renamed, reused or removed once released (a test pins the list). */
export const API_ERRORS = {
  api_unauthorized: { status: 401, message: "Missing, invalid, expired or revoked agent token.", fix: "Send `Authorization: Bearer <token>` with a token created under Account > Agent tokens." },
  api_rate_limited: { status: 429, message: "Too many requests for this token.", fix: "Wait for the number of seconds in the Retry-After header, then retry." },
  api_not_found: { status: 404, message: "No such project, page or widget, or you may not see it.", fix: "List /api/v1/projects, then follow the paths it returns." },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

/** The same body in every failure: a stable code, the JSON path of the problem, a message and a suggested fix. */
export const apiError = (code: ApiErrorCode, headers: HeadersInit = {}): Response => {
  const { status, message, fix } = API_ERRORS[code];
  return Response.json({ errors: [{ code, path: "", message, fix }] }, { status, headers: { "cache-control": "no-store", ...headers } });
};
