import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentViewer } from "@/features/auth/server/runtime";
import { AppShell } from "@/features/repos/components/app-shell";
import { getProjects } from "@/features/repos/server/runtime";
import { NEW_TOKEN_COOKIE, TOKEN_ERRORS, looksLikeToken, type TokenIssueCode } from "../domain/tokens";
import { getTokens } from "../server/runtime";
import { TokensView } from "./tokens-view";

type Query = Promise<{ saved?: string; error?: string }>;

/** `/account/tokens`: the signed-in user's own agent tokens, nobody else's. */
export async function TokensContent({ searchParams }: { searchParams: Query }) {
  const { saved, error } = await searchParams;
  const viewer = await currentViewer(await headers());
  if (!viewer) redirect("/sign-in");
  const cookie = (await cookies()).get(NEW_TOKEN_COOKIE)?.value;
  const [tokens, projects] = await Promise.all([getTokens().list(viewer), getProjects().visibleTo(viewer.login)]);

  return (
    <AppShell projects={projects}>
      <TokensView
        tokens={tokens}
        created={cookie && looksLikeToken(cookie) ? cookie : null}
        saved={saved === "1"}
        error={error !== undefined && Object.hasOwn(TOKEN_ERRORS, error) ? (error as TokenIssueCode) : null}
        now={new Date()}
      />
    </AppShell>
  );
}
