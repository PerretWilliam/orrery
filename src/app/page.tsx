import { Suspense } from "react";
import { Brand, HomeContent } from "@/features/repos/components/home-content";

// Request-time data (cookies, database) is read inside the Suspense boundary, so the shell stays static.
export default function Home() {
  return (
    <Suspense fallback={<Brand />}>
      <HomeContent />
    </Suspense>
  );
}
