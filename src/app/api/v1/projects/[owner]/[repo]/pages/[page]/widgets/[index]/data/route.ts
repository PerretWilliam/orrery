import { getApi } from "@/features/api/server/runtime";

type Params = Promise<{ owner: string; repo: string; page: string; index: string }>;

export const GET = async (request: Request, { params }: { params: Params }) => {
  const { owner, repo, page, index } = await params;
  return getApi().getWidgetData(request, { owner, name: repo }, page, index);
};
