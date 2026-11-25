import { getApi } from "@/features/api/server/runtime";

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) => {
  const { owner, repo } = await params;
  return getApi().getProject(request, { owner, name: repo });
};
