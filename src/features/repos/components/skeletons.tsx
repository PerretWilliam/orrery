import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** What loads is announced once, by name; the blocks themselves say nothing. */
function Loading({ className, children }: { className: string; children: React.ReactNode }) {
  const t = useTranslations("Widgets");
  return (
    <div role="status" aria-busy="true" aria-label={t("loading")} className={className}>
      {children}
    </div>
  );
}

function CardSkeleton({ className, body }: { className?: string; body: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-1/3" />
      </CardHeader>
      <CardContent>
        <Skeleton className={body} />
      </CardContent>
    </Card>
  );
}

/** A project's page before its file is read: the title line, then a first row of numbers and a row of larger cards. */
export function ProjectSkeleton() {
  return (
    <Loading className="flex flex-col gap-6">
      <div className="flex h-8 items-center gap-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <CardSkeleton key={n} body="h-9 w-24" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton body="h-48 w-full" />
        <CardSkeleton body="h-48 w-full" />
      </div>
    </Loading>
  );
}

/** A settings page: the title, the line under it, then its cards. */
export function SettingsSkeleton() {
  return (
    <Loading className="flex w-full max-w-4xl flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-7 w-72" />
      <CardSkeleton body="h-20 w-full" />
      <CardSkeleton body="h-32 w-full" />
    </Loading>
  );
}

/** A single card in the middle of the screen: the setup wizard. */
export function CenteredSkeleton() {
  return (
    <Loading className="flex flex-1 items-center justify-center p-6">
      <CardSkeleton className="w-full max-w-md" body="h-32 w-full" />
    </Loading>
  );
}

/** The whole signed-in screen on its first load: the brand where it will stay, and blocks where the rest will appear. */
export function ShellSkeleton() {
  const t = useTranslations("Shell");
  return (
    <div className="flex min-h-svh w-full flex-col md:flex-row">
      <div className="hidden w-64 shrink-0 flex-col gap-4 border-r bg-card p-4 md:flex">
        <div className="flex items-center gap-2">
          <Image src="/icon.svg" alt="" width={32} height={32} />
          <span className="text-base font-semibold tracking-tight">{t("brand")}</span>
        </div>
        <Skeleton className="mt-4 h-4 w-20" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <div className="mt-auto flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="border-b bg-card px-4 py-3 font-semibold tracking-tight md:hidden">{t("brand")}</div>
      <div className="flex-1 p-6">
        <ProjectSkeleton />
      </div>
    </div>
  );
}
