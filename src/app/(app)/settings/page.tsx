import { Suspense } from "react";
import { AppearanceContent } from "@/features/settings/components/appearance-content";
import { SettingsSkeleton } from "@/features/repos/components/skeletons";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <AppearanceContent />
    </Suspense>
  );
}
