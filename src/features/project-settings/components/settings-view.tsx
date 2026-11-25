import { useTranslations } from "next-intl";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { secretsPath } from "@/features/secrets/domain/paths";
import { SETTINGS_ERRORS, settingsPath, type SettingsErrorCode } from "../domain/hosts";
import type { Overview } from "../server/service";

type Props = { project: { owner: string; name: string; title: string }; overview: Overview; saved: boolean; error: SettingsErrorCode | null };

/** What a maintainer may change on a project. Only the actions the user is allowed to take are shown. */
export function SettingsView({ project, overview, saved, error }: Props) {
  const t = useTranslations("ProjectSettings");
  const base = settingsPath(project);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title", { project: project.title })}</h1>
      {saved ? (
        <Alert>
          <AlertTitle>{t("saved")}</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>
            <code>{error}</code>: {Reflect.get(SETTINGS_ERRORS, error).fix}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("hostsTitle")}</CardTitle>
          <CardDescription>{t("hostsIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {overview.hosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hostsEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {overview.hosts.map((host) => (
                <li key={host} className="flex items-center justify-between gap-2 rounded border p-2">
                  <code>{host}</code>
                  <form method="post" action={`${base}/hosts/remove`}>
                    <input type="hidden" name="host" value={host} />
                    <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {t("remove")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form method="post" action={`${base}/hosts/add`} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="host">{t("hostLabel")}</Label>
              <Input id="host" name="host" required maxLength={253} placeholder="api.example.com" autoComplete="off" />
            </div>
            <button type="submit" className={buttonVariants()}>
              {t("add")}
            </button>
          </form>
        </CardContent>
      </Card>
      {overview.canManageSecrets ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("secretsTitle")}</CardTitle>
            <CardDescription>{t("secretsBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={secretsPath(project)} className={buttonVariants({ variant: "outline" })}>
              {t("secretsOpen")}
            </Link>
          </CardContent>
        </Card>
      ) : null}
      {overview.canReindex ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("reindexTitle")}</CardTitle>
            <CardDescription>{t("reindexBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" action={`${base}/reindex`}>
              <button type="submit" className={buttonVariants({ variant: "outline" })}>
                {t("reindex")}
              </button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
