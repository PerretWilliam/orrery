import { cache } from "react";
import type { Widget, WidgetProject } from "../domain/types";
import { getWidgetData } from "../server/runtime";
import { WidgetRenderer } from "./registry";
import { Freshness, WidgetError } from "./widget-states";

/** Asked once per request, however many components need a widget's data. */
const loadWidget = cache((project: WidgetProject, widget: Widget) => getWidgetData().load(project, widget));

/**
 * One widget with its data, drawn by its renderer (loaded by the registry). Its age is said here only when it is stale:
 * otherwise the page says it once. When the source fails, the widget's cell shows the structured error and nothing else changes.
 */
export async function WidgetFrame({ project, widget }: { project: WidgetProject; widget: Widget }) {
  const result = await loadWidget(project, widget);
  const title = "title" in widget ? widget.title : undefined;
  if (!result.ok) return <WidgetError title={title} errors={result.errors} />;
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="min-h-0 flex-1">
        <WidgetRenderer widget={widget} data={result.data} />
      </div>
      {result.stale ? <Freshness fetchedAt={result.fetchedAt} stale now={new Date()} /> : null}
    </div>
  );
}

/** One age for the whole page: that of its oldest data, so nothing shown without its own age is older than this says. */
export async function PageFreshness({ project, widgets }: { project: WidgetProject; widgets: readonly Widget[] }) {
  const results = await Promise.all(widgets.map((widget) => loadWidget(project, widget)));
  const times = results.flatMap((result) => (result.ok && !result.stale && result.fetchedAt ? [result.fetchedAt.getTime()] : []));
  if (times.length === 0) return null;
  return <Freshness fetchedAt={new Date(Math.min(...times))} stale={false} now={new Date()} />;
}
