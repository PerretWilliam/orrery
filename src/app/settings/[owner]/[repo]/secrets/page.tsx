import { Suspense } from "react";
import { SecretsContent } from "@/features/secrets/components/secrets-content";

export default function SecretsPage(props: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={null}>
      <SecretsContent {...props} />
    </Suspense>
  );
}
