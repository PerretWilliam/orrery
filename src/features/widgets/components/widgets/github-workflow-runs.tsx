import type { WidgetProps } from "../../domain/types";
import { ActivityList } from "../activity-list";

/** The `github.workflow_runs` list of the repository, read-only. */
export default function GithubWorkflowRuns({ widget, data }: WidgetProps<"github.workflow_runs">) {
  return <ActivityList title={widget.title} data={data} />;
}
