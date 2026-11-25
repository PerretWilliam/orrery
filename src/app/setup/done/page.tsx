import { Suspense } from "react";
import { DoneContent } from "@/features/setup/components/setup-content";
import { CenteredSkeleton } from "@/features/repos/components/skeletons";

export default function SetupDonePage({ searchParams }: PageProps<"/setup/done">) {
  return (
    <Suspense fallback={<CenteredSkeleton />}>
      <DoneContent searchParams={searchParams} />
    </Suspense>
  );
}
