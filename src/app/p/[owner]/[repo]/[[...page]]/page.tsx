import { Suspense } from "react";
import { ProjectContent } from "@/features/repos/components/project-content";

export default function ProjectPage({ params }: { params: Promise<{ owner: string; repo: string; page?: string[] }> }) {
  return (
    <Suspense fallback={null}>
      <ProjectContent params={params} />
    </Suspense>
  );
}
