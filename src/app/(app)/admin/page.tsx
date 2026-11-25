import { Suspense } from "react";
import { AdminContent } from "@/features/admin-settings/components/admin-content";
import { SettingsSkeleton } from "@/features/repos/components/skeletons";

export default function AdminPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <AdminContent {...props} />
    </Suspense>
  );
}
