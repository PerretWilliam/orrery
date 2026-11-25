import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_DAYS, MAX_DAYS, MAX_NAME, TOKEN_ERRORS, TOKENS_PATH, type TokenIssueCode } from "../domain/tokens";
import type { TokenSummary } from "../server/store";

type Props = { tokens: readonly TokenSummary[]; created: string | null; saved: boolean; error: TokenIssueCode | null; now: Date };

const day = (date: Date) => date.toISOString().slice(0, 10);

/** The token itself appears once, right after its creation; the list never shows more than a label and dates. */
export function TokensView({ tokens, created, saved, error, now }: Props) {
  const t = useTranslations("Tokens");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {created ? (
        <Alert>
          <AlertTitle>{t("createdTitle")}</AlertTitle>
          <AlertDescription>
            <code className="break-all">{created}</code>
            <span className="block">{t("createdBody")}</span>
          </AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert>
          <AlertTitle>{t("saved")}</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("errorTitle")}</AlertTitle>
          <AlertDescription>
            <code>{error}</code>: {Reflect.get(TOKEN_ERRORS, error).fix}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tokens.map((token) => {
                const state = token.revokedAt ? "revoked" : token.expiresAt <= now ? "expired" : "active";
                return (
                  <li key={token.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                    <div>
                      <span className="font-medium">{token.name}</span> <span className="text-xs text-muted-foreground">({t(state)})</span>
                      <p className="text-xs text-muted-foreground">
                        {t("dates", { created: day(token.createdAt), expires: day(token.expiresAt), used: token.lastUsedAt ? day(token.lastUsedAt) : t("never") })}
                      </p>
                    </div>
                    {state === "active" ? (
                      <form method="post" action={`${TOKENS_PATH}/revoke`}>
                        <input type="hidden" name="id" value={token.id} />
                        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {t("revoke")}
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("formTitle")}</CardTitle>
          <CardDescription>{t("formHelp", { days: DEFAULT_DAYS, max: MAX_DAYS })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" action={`${TOKENS_PATH}/create`} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="token-name">{t("name")}</Label>
              <Input id="token-name" name="name" required maxLength={MAX_NAME} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="token-days">{t("days")}</Label>
              <Input id="token-days" name="days" type="number" min={1} max={MAX_DAYS} placeholder={String(DEFAULT_DAYS)} autoComplete="off" />
            </div>
            <button type="submit" className={buttonVariants()}>
              {t("create")}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
