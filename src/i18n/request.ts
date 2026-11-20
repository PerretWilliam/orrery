import { getRequestConfig } from "next-intl/server";

// English only in V1 (docs/scope.md): no locale routing, a single catalog.
export const LOCALE = "en";

export default getRequestConfig(async () => ({
  locale: LOCALE,
  messages: (await import("../../messages/en.json")).default,
}));
