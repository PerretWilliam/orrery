import { useFormatter } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activityItems, safeGithubUrl } from "../domain/activity";
import { WidgetEmpty } from "./widget-states";

/** The list every GitHub widget shows: key, title, state and author, all text; the link only on github.com. */
export function ActivityList({ title, data }: { title: string | undefined; data: unknown }) {
  const format = useFormatter();
  const items = activityItems(data);
  if (items.length === 0) return <WidgetEmpty title={title} />;
  return (
    <Card className="h-full">
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="min-h-0 flex-1 overflow-auto">
        <ul className="flex flex-col divide-y text-sm">
          {items.map((item, index) => {
            const href = safeGithubUrl(item.url);
            const label = `${item.key} ${item.title}`.trim();
            return (
              <li key={`${item.key}-${index}`} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                  {item.by ? <span className="ml-2 text-muted-foreground">{item.by}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.at && !Number.isNaN(Date.parse(item.at)) ? <time dateTime={item.at} className="text-xs text-muted-foreground">{format.dateTime(new Date(item.at), { dateStyle: "medium", timeZone: "UTC" })}</time> : null}
                  <Badge variant="secondary">{item.state}</Badge>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
