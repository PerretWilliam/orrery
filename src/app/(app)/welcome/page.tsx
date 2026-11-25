import { Suspense } from "react";
import { ProjectSkeleton } from "@/features/repos/components/skeletons";
import { WelcomeContent } from "@/features/repos/components/welcome-content";

export default function WelcomePage() {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <WelcomeContent />
    </Suspense>
  );
}
