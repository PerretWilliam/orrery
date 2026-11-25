import type { ConfigV1 } from "@/features/config/domain/schema-v1";
import type { Widget } from "../domain/types";
import { getWidgetData } from "../server/runtime";
import { WidgetRenderer } from "./registry";
import { Freshness, WidgetError } from "./widget-states";

/**
 * One widget with its data: the renderer (loaded by the registry), then how old the data is. When the source fails,
 * the widget's cell shows the structured error and nothing else on the page changes.
 */
export async function WidgetFrame({ project, widget }: { project: { id: string; config: ConfigV1 }; widget: Widget }) {
  const result = await getWidgetData().load(project, widget);
  const title = "title" in widget ? widget.title : undefined;
  if (!result.ok) return <WidgetError title={title} errors={result.errors} />;
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="min-h-0 flex-1">
        <WidgetRenderer widget={widget} data={result.data} />
      </div>
      <Freshness fetchedAt={result.fetchedAt} stale={result.stale} now={new Date()} />
    </div>
  );
}
