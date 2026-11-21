import { Suspense } from "react";
import { SetupContent } from "@/features/setup/components/setup-content";

// Request-time data (cookies, database) is read inside the Suspense boundary, so the shell stays static.
export default function SetupPage({ searchParams }: PageProps<"/setup">) {
  return (
    <Suspense fallback={null}>
      <SetupContent searchParams={searchParams} />
    </Suspense>
  );
}
