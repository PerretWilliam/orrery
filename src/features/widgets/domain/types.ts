import type { ConfigV1 } from "@/features/config/domain/schema-v1";

/** One widget as the parser returns it, and the props every widget renderer receives. */
export type Widget = ConfigV1["pages"][number]["widgets"][number];
export type WidgetType = Widget["type"];
export type WidgetOf<T extends WidgetType> = Extract<Widget, { type: T }>;
/** `data` is what the widget's source answered (untrusted, read with the safe path extractor), or `null` for a widget without a source. */
export type WidgetProps<T extends WidgetType = WidgetType> = { widget: WidgetOf<T>; data: unknown };
export type AnyWidgetProps = { widget: Widget; data: unknown };
