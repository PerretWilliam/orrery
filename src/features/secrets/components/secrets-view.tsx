import { useTranslations } from "next-intl";
import { SavedToast } from "@/components/saved-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SECRET_ERRORS, type SecretIssueCode } from "../domain/errors";
import { secretsPath } from "../domain/paths";
import type { SecretSummary } from "../server/store";

type Props = { project: { owner: string; name: string; title: string }; secrets: SecretSummary[]; saved: boolean; error: SecretIssueCode | null };

/** Names and bound hosts only. The value box is always empty: a secret can be replaced, never read back. */
export function SecretsView({ project, secrets, saved, error }: Props) {
  const t = useTranslations("Secrets");
  const base = secretsPath(project);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title", { project: project.title })}</h1>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {saved ? <SavedToast message={t("saved")} /> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>
            <code>{error}</code>: {Reflect.get(SECRET_ERRORS, error).fix}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {secrets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {secrets.map((secret) => (
                <li key={secret.name} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                  <div>
                    <code className="font-medium">{secret.name}</code>
                    <p className="text-xs text-muted-foreground">
                      {t("hosts")}: {secret.boundHosts.join(", ")}
                    </p>
                  </div>
                  <form method="post" action={`${base}/delete`}>
                    <input type="hidden" name="name" value={secret.name} />
                    <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {t("delete")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("formTitle")}</CardTitle>
          <CardDescription>{t("formHelp")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" action={`${base}/save`} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="secret-name">{t("name")}</Label>
              <Input id="secret-name" name="name" required maxLength={64} pattern="[A-Z][A-Z0-9_]*" placeholder="GAME_API_TOKEN" autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="secret-value">{t("value")}</Label>
              <Input id="secret-value" name="value" type="password" required maxLength={8192} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="secret-hosts">{t("hostsLabel")}</Label>
              <Input id="secret-hosts" name="hosts" required placeholder="api.example.com" autoComplete="off" />
            </div>
            <button type="submit" className={buttonVariants()}>
              {t("save")}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
