import { Suspense } from "react";
import { AppearanceContent } from "@/features/settings/components/appearance-content";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <AppearanceContent />
    </Suspense>
  );
}
