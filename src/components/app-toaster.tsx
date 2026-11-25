"use client";

import { Toaster } from "@yusufceng1z/ding-react";
import { useTranslations } from "next-intl";

/** Where toasts appear. globals.css dresses them in the app's colors. */
export function AppToaster() {
  const t = useTranslations("Toasts");
  return <Toaster position="bottom-right" labels={{ region: t("region"), dismiss: t("dismiss") }} />;
}
