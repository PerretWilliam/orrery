import { Suspense } from "react";
import { SignInContent } from "@/features/auth/components/sign-in-content";

// Request-time data (cookies, database) is read inside the Suspense boundary, so the shell stays static.
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={null}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}
