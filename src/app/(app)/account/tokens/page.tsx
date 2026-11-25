import { Suspense } from "react";
import { TokensContent } from "@/features/agents/components/tokens-content";
import { SettingsSkeleton } from "@/features/repos/components/skeletons";

export default function TokensPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <TokensContent {...props} />
    </Suspense>
  );
}
