import type { WidgetProps } from "../../domain/types";
import { ActivityList } from "../activity-list";

/** The `github.pull_requests` list of the repository, read-only. */
export default function GithubPullRequests({ widget, data }: WidgetProps<"github.pull_requests">) {
  return <ActivityList title={widget.title} data={data} />;
}
