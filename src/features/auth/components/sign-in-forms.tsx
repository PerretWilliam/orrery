import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTH_ERRORS, type AuthIssueCode } from "../domain/errors";

/** The sign-in page. `error` is one of our codes (never text from the URL); `canSignIn` is false until setup is done. */
export function SignInView({ error, canSignIn }: { error: AuthIssueCode | null; canSignIn: boolean }) {
  const t = useTranslations("Auth");
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("intro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("errorTitle")}</AlertTitle>
              <AlertDescription>{AUTH_ERRORS[error].fix}</AlertDescription>
            </Alert>
          ) : null}
          {canSignIn ? (
            <form method="post" action="/auth/sign-in">
              <button type="submit" className={buttonVariants()}>
                {t("submit")}
              </button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
