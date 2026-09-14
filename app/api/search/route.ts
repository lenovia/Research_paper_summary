import { searchEric } from "@/lib/eric";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { keywords?: string[] };
    const keywords = Array.isArray(body.keywords) ? body.keywords : [];
    const papers = await searchEric(keywords);

    return Response.json({ papers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not search ERIC.";
    const status = message.includes("timed out")
      ? 504
      : message.includes("rate-limiting")
        ? 429
        : 500;

    return Response.json({ error: message }, { status });
  }
}
