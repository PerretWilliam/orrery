import { CircleAlert, Inbox } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { Failure } from "@/features/data-proxy/domain/source-proxy";

/** The blocks of each family of widgets, so the card that arrives looks like the one that was waiting. */
const SHAPES = {
  value: ["h-9 w-24", "h-4 w-32"],
  chart: ["min-h-24 w-full flex-1"],
  rows: ["h-8 w-48", "h-5 w-full", "h-5 w-full", "h-5 w-full", "h-5 w-full"],
  text: ["h-4 w-full", "h-4 w-5/6", "h-4 w-2/3"],
} as const;

const shapeOf = (type: string): keyof typeof SHAPES => {
  if (type === "kpi" || type === "status") return "value";
  if (type === "line" || type === "bar" || type === "donut" || type === "cohort") return "chart";
  return type === "table" || type.startsWith("github.") ? "rows" : "text";
};

/** Shown while a widget's data is on its way. */
export function WidgetLoading({ type }: { type: string }) {
  const t = useTranslations("Widgets");
  const shape = shapeOf(type);
  return (
    <Card className="h-full" aria-busy="true" aria-label={t("loading")} data-shape={shape}>
      <CardHeader>
        <Skeleton className="h-4 w-1/3" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {SHAPES[shape].map((block, index) => (
          <Skeleton key={index} className={block} />
        ))}
      </CardContent>
    </Card>
  );
}

/** The empty state: the source answered, but there is nothing to show. */
export function WidgetEmpty({ title }: { title?: string }) {
  const t = useTranslations("Widgets");
  return (
    <Card className="h-full">
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-1">
        <Empty className="gap-0 p-0">
          <EmptyMedia variant="icon">
            <Inbox aria-hidden />
          </EmptyMedia>
          <EmptyDescription>{t("empty")}</EmptyDescription>
        </Empty>
      </CardContent>
    </Card>
  );
}

/** Red outline and a red wash over the card's own surface. */
const FAILED = "h-full bg-linear-to-b from-destructive/10 to-destructive/10 ring-destructive/40";

function FailureTitle({ children }: { children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-start gap-2">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
      <span>{children}</span>
    </CardTitle>
  );
}

/** A failure stays in its own widget: what happened, then how to fix it, then the code. All three come from our catalogs, never from the source's answer. */
export function WidgetError({ title, errors }: { title?: string; errors: readonly Failure[] }) {
  const t = useTranslations("Widgets");
  return (
    <Card className={FAILED} role="alert">
      <CardHeader>
        <FailureTitle>{title ?? t("errorTitle")}</FailureTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4 text-sm">
          {errors.map((error) => (
            <li key={`${error.code}-${error.path ?? ""}`} className="flex flex-col items-start gap-2">
              <p className="font-medium">{error.message}</p>
              <p className="self-stretch rounded-lg border bg-card p-2 text-muted-foreground">
                <span className="font-medium text-foreground">{t("fix")}</span> {error.fix}
              </p>
              <Badge variant="destructive">
                <code>{error.code}</code>
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Shown when a widget's own code fails to draw. No detail: an error message could carry what the source sent. */
export function WidgetCrashed({ title }: { title?: string }) {
  const t = useTranslations("Widgets");
  return (
    <Card className={FAILED} role="alert">
      <CardHeader>
        {title ? <FailureTitle>{title}</FailureTitle> : null}
        <CardDescription className="text-destructive">{t("crashed")}</CardDescription>
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
