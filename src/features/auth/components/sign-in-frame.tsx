import { Activity, GitPullRequest, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

const POINTS = [
  { id: "code", Icon: GitPullRequest },
  { id: "metrics", Icon: Activity },
  { id: "access", Icon: ShieldCheck },
] as const;

/** The sign-in screen around its form: on a wide screen the product on the left, in the brand colour. All of it is static, so it is there while the form loads. */
export function SignInFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Auth");
  const brand = useTranslations("Shell")("brand");
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-linear-to-br from-brand to-brand-deep p-12 text-brand-foreground lg:flex lg:flex-col lg:justify-between">
        {/* Orbits, only for show. */}
        <div aria-hidden className="pointer-events-none absolute top-0 right-0">
          {["size-112", "size-80", "size-48"].map((size) => (
            <div key={size} className={`absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-foreground/15 ${size}`}>
              <span className="absolute bottom-[14.6%] left-[14.6%] size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-brand-foreground/70" />
            </div>
          ))}
        </div>
        <p className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <Image src="/icon.svg" alt="" width={36} height={36} className="rounded-lg ring-1 ring-brand-foreground/30" />
          {brand}
        </p>
        <div className="relative flex max-w-md flex-col gap-8">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">{t("headline")}</h2>
          <ul className="flex flex-col gap-4">
            {POINTS.map(({ id, Icon }) => (
              <li key={id} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-foreground/15">
                  <Icon aria-hidden className="size-4.5" />
                </span>
                {t(`points.${id}`)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-brand-foreground/80">{t("tagline")}</p>
      </section>
      <div className="flex items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">{children}</div>
      </div>
    </main>
  );
}
