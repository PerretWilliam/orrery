import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SETUP_ERRORS, type SetupIssueCode } from "../domain/errors";
import type { buildManifest } from "../domain/manifest";

export function SetupShell({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}

/** The structured fix of an error code. Only known codes are shown: nothing from the URL is echoed. */
export function SetupNotice({ code }: { code: SetupIssueCode | null }) {
  const t = useTranslations("Setup");
  if (!code) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("errorTitle")}</AlertTitle>
      <AlertDescription>{SETUP_ERRORS[code].fix}</AlertDescription>
    </Alert>
  );
}

/** The page when the App cannot be created yet: only the fix for the error. */
export function SetupBlocked({ code }: { code: SetupIssueCode }) {
  const t = useTranslations("Setup");
  return (
    <SetupShell title={t("title")}>
      <SetupNotice code={code} />
    </SetupShell>
  );
}

export function TokenForm({ error }: { error: SetupIssueCode | null }) {
  const t = useTranslations("Setup");
  return (
    <SetupShell title={t("title")} description={t("tokenIntro")}>
      <SetupNotice code={error} />
      <form method="post" action="/setup/token" className="flex flex-col gap-3">
        <Label htmlFor="token">{t("tokenLabel")}</Label>
        <Input id="token" name="token" type="password" autoComplete="off" required />
        <button type="submit" className={buttonVariants()}>{t("tokenSubmit")}</button>
      </form>
    </SetupShell>
  );
}

/** Posts the manifest to GitHub, which asks the person to confirm and sends the browser back with a code. */
export function CreateAppForm({ manifest, state, error }: { manifest: ReturnType<typeof buildManifest>; state: string; error: SetupIssueCode | null }) {
  const t = useTranslations("Setup");
  return (
    <SetupShell title={t("title")} description={t("createIntro")}>
      <SetupNotice code={error} />
      <p className="text-sm text-muted-foreground">{t("createPermissions")}</p>
      <form method="post" action={`https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`}>
        <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
        <button type="submit" className={buttonVariants()}>{t("createSubmit")}</button>
      </form>
    </SetupShell>
  );
}

export function SetupDone({ slug }: { slug: string | null }) {
  const t = useTranslations("Setup");
  return (
    <SetupShell title={t("doneTitle")} description={t("doneBody")}>
      {slug ? (
        <a className={buttonVariants()} href={`https://github.com/apps/${slug}/installations/new`}>
          {t("doneInstall")}
        </a>
      ) : null}
    </SetupShell>
  );
}
