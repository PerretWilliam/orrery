import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSetupService } from "@/features/setup/server/runtime";
import { AUTH_ERRORS, type AuthIssueCode } from "../domain/errors";
import { currentUser } from "../server/runtime";
import { SignInView } from "./sign-in-forms";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

/** Our own codes are shown as such; any other error from the URL (Better Auth's, or made up) means "refused". Nothing is echoed. */
const errorFrom = (value: string | string[] | undefined): AuthIssueCode | null => {
  if (typeof value !== "string" || value === "") return null;
  return Object.hasOwn(AUTH_ERRORS, value) ? (value as AuthIssueCode) : "auth_sign_in_refused";
};

/** `/sign-in`. A signed-in user goes home; a suspended one is told why. */
export async function SignInContent({ searchParams }: { searchParams: Search }) {
  // Reading searchParams first makes the render request-time: the database must not be touched while prerendering.
  const fromUrl = errorFrom((await searchParams).error);
  if (!(await getSetupService().isCompleted())) return <SignInView error="auth_not_configured" canSignIn={false} />;
  const user = await currentUser(await headers());
  if (user?.ok) redirect("/");
  return <SignInView error={fromUrl ?? (user ? user.issue.code : null)} canSignIn />;
}
