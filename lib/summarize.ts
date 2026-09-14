import OpenAI from "openai";
import { getEricFullText } from "@/lib/eric";
import { getEuropePmcFullText } from "@/lib/europe-pmc";
import type { Paper, PaperSummary } from "@/lib/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeJsonParse(value: string): PaperSummary[] {
  const trimmed = value.trim();
  const jsonStart = trimmed.indexOf("[");
  const jsonEnd = trimmed.lastIndexOf("]");

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("The summary response was not valid JSON.");
  }

  return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as PaperSummary[];
}

export async function summarizePapersForReaders(papers: Paper[]) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const compactPapers = await Promise.all(
    papers.map(async (paper) => {
      let fullText = paper.fullText ?? "";

      if (!fullText) {
        try {
          fullText =
            paper.source === "eric"
              ? await getEricFullText(paper)
              : await getEuropePmcFullText(paper);
        } catch (error) {
          console.warn(
            `Full-text extraction failed for ${paper.id}; using abstract.`,
            error,
          );
        }
      }

      return {
        paperId: paper.id,
        title: paper.title,
        link: paper.link,
        abstract: paper.abstract,
        categories: paper.categories,
        source: paper.source,
        fullText: fullText || paper.abstract,
      };
    }),
  );

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          "You turn education research into warm, accurate summaries for non-technical readers. Avoid jargon. If a technical term is necessary, explain it in simple language.",
      },
      {
        role: "user",
        content: `Summarize these education research papers for a non-technical reader.

Return only valid JSON matching this TypeScript shape:
Array<{
  paperId: string;
  title: string;
  link: string;
  whyItMatters: string;
  plainLanguageSummary: string;
  keyTakeaways: string[];
  termsExplained: Array<{ term: string; explanation: string }>;
}>

Rules:
- Keep each plainLanguageSummary under 170 words.
- Use concrete everyday language.
- Do not overstate the paper's findings.
- Focus on what this could mean for the audience implied by the paper and search keywords.
- If the provided full text is enough, rely on it more than the abstract.
- Include 2-4 keyTakeaways per paper.
- Explain only terms that a non-technical reader may not know.

Papers:
${JSON.stringify(compactPapers, null, 2)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message.content;

  if (!content) {
    throw new Error("OpenAI did not return a summary.");
  }

  return safeJsonParse(content);
}
