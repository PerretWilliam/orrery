import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Whether the window is narrower than the breakpoint; the server assumes a wide one. */
export const useIsMobile = () => useSyncExternalStore(subscribe, () => window.innerWidth < MOBILE_BREAKPOINT, () => false);
