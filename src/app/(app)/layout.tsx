import { Suspense } from "react";
import { ShellContent } from "@/features/repos/components/shell-content";
import { ShellSkeleton } from "@/features/repos/components/skeletons";

// One sidebar for every signed-in page: going from a page to another only replaces what is beside it.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ShellContent>{children}</ShellContent>
    </Suspense>
  );
}
