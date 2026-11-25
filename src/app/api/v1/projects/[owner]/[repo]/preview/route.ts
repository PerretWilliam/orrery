import { getApi } from "@/features/api/server/runtime";

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) => {
  const { owner, repo } = await params;
  return getApi().previewSource(request, { owner, name: repo });
};
