import { Suspense } from "react";
import { DoneContent } from "@/features/setup/components/setup-content";

export default function SetupDonePage({ searchParams }: PageProps<"/setup/done">) {
  return (
    <Suspense fallback={null}>
      <DoneContent searchParams={searchParams} />
    </Suspense>
  );
}
