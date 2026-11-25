"use client";

import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { getImageProps } from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { avatarUrl } from "../domain/avatar";

/** The signed-in user, and the menu to open the settings or sign out. The avatar is served by this instance, so the page loads nothing from GitHub. */
export function UserMenu({ login, image }: { login: string; image?: string | null }) {
  const t = useTranslations("Shell");
  const { setOpenMobile } = useSidebar();
  const signOut = useRef<HTMLFormElement>(null);
  const src = avatarUrl(image);
  return (
    <>
      {/* Outside the menu: it must still be in the document when the closing menu submits it. */}
      <form ref={signOut} method="post" action="/auth/sign-out" hidden />
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
          <Avatar>
            {src ? <AvatarImage {...getImageProps({ src, alt: "", width: 32, height: 32 }).props} /> : null}
            <AvatarFallback>{login.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="truncate font-medium">{login}</span>
          <ChevronsUpDown className="ml-auto" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/settings" />} onClick={() => setOpenMobile(false)}>
              <Settings />
              {t("settings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut.current?.requestSubmit()}>
              <LogOut />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
