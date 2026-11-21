"use client";

import { useEffect } from "react";
import { cookieValueFor, LAST_PAGE_COOKIE, type Place } from "../domain/project";

/** Remembers the page being looked at, so `/` reopens it. The cookie holds a path and nothing secret; it is validated on use. */
export function RememberLocation({ place }: { place: Place }) {
  const { owner, name, page } = place;
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${LAST_PAGE_COOKIE}=${cookieValueFor({ owner, name, page })}; path=/; max-age=31536000; samesite=lax${secure}`;
  }, [owner, name, page]);
  return null;
}
