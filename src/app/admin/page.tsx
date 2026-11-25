import { Suspense } from "react";
import { AdminContent } from "@/features/admin-settings/components/admin-content";

export default function AdminPage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  return (
    <Suspense fallback={null}>
      <AdminContent {...props} />
    </Suspense>
  );
}
