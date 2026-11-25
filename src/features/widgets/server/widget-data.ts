import type { Failure, ProxyRequest, ProxyResult } from "@/features/data-proxy/domain/source-proxy";
import { parseTtl } from "@/features/config/domain/ttl";
import type { ConfigV1 } from "@/features/config/domain/schema-v1";
import type { Widget } from "../domain/types";

/** What a widget is given: the source's answer with its age, or why there is none. `null` data means the widget reads nothing from a source. */
export type WidgetData = { ok: true; data: unknown; fetchedAt: Date | null; stale: boolean } | { ok: false; errors: readonly Failure[] };

const DEFAULT_TTL_SECONDS = 300;
const NONE: WidgetData = { ok: true, data: null, fetchedAt: null, stale: false };

export type WidgetDataDeps = { proxy: { get(request: ProxyRequest): Promise<ProxyResult> } };

/**
 * Finds the source a widget reads in the project's config and asks the data proxy for it. Widgets without a source
 * (inline Markdown, GitHub widgets) read nothing here. A failure stays in its widget: it is returned, never thrown.
 */
export function createWidgetData({ proxy }: WidgetDataDeps) {
  return {
    async load(project: { id: string; config: ConfigV1 }, widget: Widget): Promise<WidgetData> {
      const id = "source" in widget ? widget.source : undefined;
      if (id === undefined) return NONE;
      const source = Object.hasOwn(project.config.sources, id) ? Reflect.get(project.config.sources, id) : undefined;
      if (!source) return { ok: false, errors: [{ code: "config_unknown_source", message: `Unknown source "${id}"`, fix: "Declare the source under `sources` in .hub.yml.", path: "source" }] };
      const result = await proxy.get({
        repositoryId: project.id,
        source: { url: source.url, method: source.method, headers: source.headers, body: source.body, ttlSeconds: parseTtl(source.ttl) ?? DEFAULT_TTL_SECONDS },
      });
      return result.ok ? { ok: true, data: result.data, fetchedAt: result.fetchedAt, stale: result.state === "stale" } : result;
    },
  };
}
export type WidgetDataService = ReturnType<typeof createWidgetData>;
