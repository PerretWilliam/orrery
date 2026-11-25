import { Suspense } from "react";
import { SecretsContent } from "@/features/secrets/components/secrets-content";
import { SettingsSkeleton } from "@/features/repos/components/skeletons";

export default function SecretsPage(props: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SecretsContent {...props} />
    </Suspense>
  );
}
