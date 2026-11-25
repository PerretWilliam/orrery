import type { WidgetProps } from "../../domain/types";
import { ActivityList } from "../activity-list";

/** The `github.releases` list of the repository, read-only. */
export default function GithubReleases({ widget, data }: WidgetProps<"github.releases">) {
  return <ActivityList title={widget.title} data={data} />;
}
