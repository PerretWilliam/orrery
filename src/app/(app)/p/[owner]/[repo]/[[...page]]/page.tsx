import { Suspense } from "react";
import { ProjectContent } from "@/features/repos/components/project-content";
import { ProjectSkeleton } from "@/features/repos/components/skeletons";

export default function ProjectPage({ params }: { params: Promise<{ owner: string; repo: string; page?: string[] }> }) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}
