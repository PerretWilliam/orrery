import { deleteSecret } from "@/features/secrets/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  return deleteSecret(request, { owner, name: repo });
}
