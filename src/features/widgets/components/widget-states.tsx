import { useFormatter, useTranslations } from "next-intl";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Failure } from "@/features/data-proxy/domain/source-proxy";

export function WidgetLoading() {
  const t = useTranslations("Widgets");
  return <Card className="h-full animate-pulse" aria-busy="true" aria-label={t("loading")} />;
}

/** The empty state: the source answered, but there is nothing to show. */
export function WidgetEmpty({ title }: { title?: string }) {
  const t = useTranslations("Widgets");
  return (
    <Card className="h-full">
      <CardHeader>
        {title ? <CardTitle>{title}</CardTitle> : null}
        <CardDescription>{t("empty")}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** A failure stays in its own widget. Codes, messages and fixes come from our catalogs, never from the source's answer. */
export function WidgetError({ title, errors }: { title?: string; errors: readonly Failure[] }) {
  const t = useTranslations("Widgets");
  return (
    <Card className="h-full border-destructive/50" role="alert">
      <CardHeader>
        <CardTitle>{title ?? t("errorTitle")}</CardTitle>
        <CardDescription>{t("errorTitle")}</CardDescription>
        <ul className="text-sm">
          {errors.map((error) => (
            <li key={`${error.code}-${error.path ?? ""}`}>
              <code>{error.code}</code>: {error.message}. {t("fix")}: {error.fix}
            </li>
          ))}
        </ul>
      </CardHeader>
    </Card>
  );
}

/** Shown when a widget's own code fails to draw. No detail: an error message could carry what the source sent. */
export function WidgetCrashed({ title }: { title?: string }) {
  const t = useTranslations("Widgets");
  return (
    <Card className="h-full border-destructive/50" role="alert">
      <CardHeader>
        {title ? <CardTitle>{title}</CardTitle> : null}
        <CardDescription>{t("crashed")}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** How old the data is. `stale` means it is past its TTL and being refreshed in the background. Nothing to say for a widget without a source. */
export function Freshness({ fetchedAt, stale, now }: { fetchedAt: Date | null; stale: boolean; now: Date }) {
  const t = useTranslations("Widgets");
  const format = useFormatter();
  if (!fetchedAt) return null;
  const when = format.relativeTime(fetchedAt, now);
  return (
    <p className="px-1 text-xs text-muted-foreground" data-stale={stale}>
      <time dateTime={fetchedAt.toISOString()}>{stale ? t("refreshing", { when }) : t("updated", { when })}</time>
    </p>
  );
}
