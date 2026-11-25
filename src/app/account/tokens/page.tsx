import { Suspense } from "react";
import { TokensContent } from "@/features/agents/components/tokens-content";

export default function TokensPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={null}>
      <TokensContent {...props} />
    </Suspense>
  );
}
