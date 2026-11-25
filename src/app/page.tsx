import { Suspense } from "react";
import { HomeContent } from "@/features/repos/components/home-content";
import { ShellSkeleton } from "@/features/repos/components/skeletons";

// Request-time data (cookies, database) is read inside the Suspense boundary, so the shell stays static.
export default function Home() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
