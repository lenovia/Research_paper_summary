import { Resend } from "resend";
import SummaryEmail from "@/lib/email-template";
import { summarizePapersForReaders } from "@/lib/summarize";
import type { Paper } from "@/lib/types";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      keywords?: string[];
      papers?: Paper[];
    };

    const email = body.email?.trim() ?? "";
    const keywords = Array.isArray(body.keywords) ? body.keywords : [];
    const papers = Array.isArray(body.papers) ? body.papers.slice(0, 8) : [];

    if (!isEmail(email)) {
      return Response.json({ error: "Enter a valid email." }, { status: 400 });
    }

    if (papers.length === 0) {
      return Response.json(
        { error: "Select at least one paper." },
        { status: 400 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return Response.json(
        { error: "RESEND_API_KEY is missing." },
        { status: 500 },
      );
    }

    const from =
      process.env.FROM_EMAIL ?? "Research Brief <onboarding@resend.dev>";
    const summaries = await summarizePapersForReaders(papers);
    const subject =
      papers.length === 1
        ? `Plain-language summary: ${papers[0].title}`
        : `${papers.length} plain-language research summaries`;

    const { data, error } = await resend.emails.send({
      from,
      to: email,
      subject,
      react: SummaryEmail({ keywords, summaries }),
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ id: data?.id, sent: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not send the summary.";

    return Response.json({ error: message }, { status: 500 });
  }
}
