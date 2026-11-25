import { removeHost } from "@/features/project-settings/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  return removeHost(request, { owner, name: repo });
}
