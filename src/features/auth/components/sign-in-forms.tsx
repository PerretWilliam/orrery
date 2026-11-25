import Image from "next/image";
import { useTranslations } from "next-intl";
import { GithubMark } from "@/components/github-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { AUTH_ERRORS, type AuthIssueCode } from "../domain/errors";
import { SignInFrame } from "./sign-in-frame";

/** The sign-in page. `error` is one of our codes (never text from the URL); `canSignIn` is false until setup is done. */
export function SignInView({ error, canSignIn }: { error: AuthIssueCode | null; canSignIn: boolean }) {
  const t = useTranslations("Auth");
  return (
    <SignInFrame>
      <Image src="/icon.svg" alt="" width={64} height={64} className="rounded-2xl shadow-lg shadow-primary/30" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      {error ? (
        <Alert variant="destructive" className="text-left">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>{AUTH_ERRORS[error].fix}</AlertDescription>
        </Alert>
      ) : null}
      {canSignIn ? (
        <form method="post" action="/auth/sign-in" className="w-full">
          <button type="submit" className={buttonVariants({ size: "lg", className: "h-11 w-full text-base" })}>
            <GithubMark data-icon="inline-start" />
            {t("submit")}
          </button>
        </form>
      ) : null}
    </SignInFrame>
  );
}

/** The same screen while the session is looked up: only the form's place is empty. */
export function SignInSkeleton() {
  const t = useTranslations("Widgets");
  return (
    <SignInFrame>
      <div role="status" aria-busy="true" aria-label={t("loading")} className="flex w-full flex-col items-center gap-6">
        <Skeleton className="size-16 rounded-2xl" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </SignInFrame>
  );
}
