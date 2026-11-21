import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SETUP_ERRORS, type SetupIssueCode } from "../domain/errors";
import { SESSION_COOKIE } from "../domain/http";
import { baseUrlFrom } from "../domain/manifest";
import { getSetupService } from "../server/runtime";
import { CreateAppForm, SetupBlocked, SetupDone, TokenForm } from "./setup-forms";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

/** An error code from the URL, only if it is one of ours. */
const knownCode = (value: string | string[] | undefined): SetupIssueCode | null =>
  typeof value === "string" && Object.hasOwn(SETUP_ERRORS, value) ? (value as SetupIssueCode) : null;

/** `/setup`: the token form, then the "create the GitHub App" step. Once set up, the page is gone. */
export async function SetupContent({ searchParams }: { searchParams: Search }) {
  // Reading searchParams first makes the render request-time: the database must not be touched while prerendering.
  const error = knownCode((await searchParams).error);
  const service = getSetupService();
  if (await service.isCompleted()) redirect("/");

  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await service.hasSession(session))) return <TokenForm error={error} />;

  const requestHeaders = await headers();
  const publicUrl = process.env.ORRERY_PUBLIC_URL;
  const base = baseUrlFrom({ publicUrl, host: requestHeaders.get("host"), proto: requestHeaders.get("x-forwarded-proto") });
  const begun = base ? await service.begin(session, base, Boolean(publicUrl)) : null;
  if (!begun?.ok) return <SetupBlocked code={begun ? begun.issue.code : "setup_origin_invalid"} />;
  return <CreateAppForm manifest={begun.manifest} state={begun.state} error={error} />;
}

/** `/setup/done`: shown right after the GitHub App was created. The app slug only builds the install link. */
export async function DoneContent({ searchParams }: { searchParams: Search }) {
  const { app } = await searchParams;
  return <SetupDone slug={typeof app === "string" && /^[A-Za-z0-9-]{1,100}$/.test(app) ? app : null} />;
}
