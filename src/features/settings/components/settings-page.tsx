import { useTranslations } from "next-intl";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { getAdminSettings } from "@/features/admin-settings/server/runtime";
import { TOKENS_PATH } from "@/features/agents/domain/tokens";
import type { Viewer } from "@/features/auth/domain/profile";

const SECTIONS = [
  { id: "appearance", href: "/settings" },
  { id: "tokens", href: TOKENS_PATH },
  { id: "admin", href: "/admin" },
] as const;
export type SettingsSection = (typeof SECTIONS)[number]["id"];

/** The title and the links between the sections. Administration is only offered to admins; its page checks again. */
export function SettingsFrame({ section, isAdmin, children }: { section: SettingsSection; isAdmin: boolean; children: React.ReactNode }) {
  const t = useTranslations("Settings");
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <nav aria-label={t("sections")} className="flex flex-wrap gap-1 border-b pb-3">
          {SECTIONS.filter(({ id }) => id !== "admin" || isAdmin).map(({ id, href }) => (
            <Link key={id} href={href} aria-current={id === section ? "page" : undefined} className={buttonVariants({ variant: id === section ? "secondary" : "ghost", size: "sm" })}>
              {t(id)}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}

/** One section of the general settings, for a signed-in user. */
export async function settingsPage(viewer: Viewer, section: SettingsSection, children: React.ReactNode) {
  return (
    <SettingsFrame section={section} isAdmin={await getAdminSettings().isAdmin(viewer)}>
      {children}
    </SettingsFrame>
  );
}
