import { lazy, type ComponentType } from "react";
import type { AnyWidgetProps, WidgetProps, WidgetType } from "../domain/types";

type Loaders = { readonly [T in WidgetType]: () => Promise<{ default: ComponentType<WidgetProps<T>> }> };

/**
 * One loader per widget type of schema v1. To add a type: add it to the schema, write its component under
 * `widgets/`, add one line here. Nothing else changes, and the config parser never knows about renderers.
 * A widget's code is only fetched when a page draws a widget of that type. Types whose renderer has not landed yet
 * share the placeholder. A test compares these keys with the schema, and `scripts/widget-budgets.mjs` caps their weight.
 */
export const LOADERS: Loaders = {
  kpi: () => import("./widgets/kpi"),
  status: () => import("./widgets/status"),
  line: () => import("./widgets/line"),
  bar: () => import("./widgets/bar"),
  donut: () => import("./widgets/donut"),
  table: () => import("./widgets/placeholder"),
  cohort: () => import("./widgets/placeholder"),
  markdown: () => import("./widgets/markdown"),
  "github.issues": () => import("./widgets/placeholder"),
  "github.pull_requests": () => import("./widgets/placeholder"),
  "github.workflow_runs": () => import("./widgets/placeholder"),
  "github.releases": () => import("./widgets/placeholder"),
};

// One lazy component per type, created once: the loader runs the first time a widget of this type is drawn.
// The cast is the one place the per-type props are widened: `widget` is always of the type its loader was picked by.
const COMPONENTS = new Map(Object.entries(LOADERS).map(([type, load]) => [type, lazy(load as () => Promise<{ default: ComponentType<AnyWidgetProps> }>)]));

/** Draws a widget with the component of its type. A component, not a lookup function, so the page never creates one while rendering. */
export function WidgetRenderer(props: AnyWidgetProps) {
  const Component = COMPONENTS.get(props.widget.type) as ComponentType<AnyWidgetProps>;
  return <Component {...props} />;
}
