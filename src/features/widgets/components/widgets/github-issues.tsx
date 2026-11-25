import type { WidgetProps } from "../../domain/types";
import { ActivityList } from "../activity-list";

/** The `github.issues` list of the repository, read-only. */
export default function GithubIssues({ widget, data }: WidgetProps<"github.issues">) {
  return <ActivityList title={widget.title} data={data} />;
}
