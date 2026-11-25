"use client";

import { toast } from "@yusufceng1z/ding-react";
import { useEffect } from "react";

/** Says once that a form was saved: `?saved=1` leaves the address, so a reload or a way back stays quiet. */
export function SavedToast({ message }: { message: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("saved")) return;
    url.searchParams.delete("saved");
    window.history.replaceState(null, "", url);
    toast.success(message);
  }, [message]);
  return null;
}
