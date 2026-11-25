import { Suspense } from "react";
import { SignInContent } from "@/features/auth/components/sign-in-content";
import { SignInSkeleton } from "@/features/auth/components/sign-in-forms";

// Request-time data (cookies, database) is read inside the Suspense boundary, so the shell stays static.
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}
