import { parseStringPromise } from "xml2js";
import type { Paper } from "@/lib/types";

const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const MAX_RESULTS = 30;

type ArxivAuthor = {
  name?: string[];
};

type ArxivLink = {
  $?: {
    href?: string;
    title?: string;
    type?: string;
  };
};

type ArxivCategory = {
  $?: {
    term?: string;
  };
};

type ArxivEntry = {
  id?: string[];
  title?: string[];
  summary?: string[];
  published?: string[];
  updated?: string[];
  author?: ArxivAuthor[];
  link?: ArxivLink[];
  category?: ArxivCategory[];
};

function cleanText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function buildSearchQuery(keywords: string[]) {
  return keywords
    .map((keyword) => {
      const safeKeyword = keyword.replace(/[()"]/g, " ").trim();
      return `(ti:"${safeKeyword}" OR abs:"${safeKeyword}")`;
    })
    .join(" OR ");
}

function oneWeekAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date;
}

function normalizeEntry(entry: ArxivEntry): Paper | null {
  const id = entry.id?.[0];
  const title = cleanText(entry.title?.[0]);
  const abstract = cleanText(entry.summary?.[0]);
  const published = entry.published?.[0];
  const updated = entry.updated?.[0] ?? published;

  if (!id || !title || !abstract || !published || !updated) {
    return null;
  }

  const links = entry.link ?? [];
  const mainLink = links.find((link) => link.$?.type === "text/html")?.$?.href ?? id;
  const pdfLink = links.find((link) => link.$?.title === "pdf")?.$?.href;

  return {
    id,
    source: "arxiv",
    title,
    abstract,
    published,
    updated,
    link: mainLink,
    pdfLink,
    authors: (entry.author ?? [])
      .map((author) => cleanText(author.name?.[0]))
      .filter(Boolean),
    categories: (entry.category ?? [])
      .map((category) => category.$?.term)
      .filter((category): category is string => Boolean(category)),
  };
}

export async function searchArxiv(keywords: string[]) {
  const filteredKeywords = keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .slice(0, 8);

  if (filteredKeywords.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    search_query: buildSearchQuery(filteredKeywords),
    start: "0",
    max_results: String(MAX_RESULTS),
    sortBy: "submittedDate",
    sortOrder: "descending",
  });

  const response = await fetch(`${ARXIV_ENDPOINT}?${params.toString()}`, {
    headers: {
      "User-Agent": "PaperBrief/0.1 (research-summary-tool)",
    },
    next: {
      revalidate: 600,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "arXiv is temporarily rate-limiting requests from this network. Wait a minute and search again.",
      );
    }

    throw new Error(`arXiv request failed with status ${response.status}`);
  }

  const xml = await response.text();
  const parsed = await parseStringPromise(xml);
  const entries = (parsed.feed?.entry ?? []) as ArxivEntry[];
  const cutoff = oneWeekAgo().getTime();

  return entries
    .map(normalizeEntry)
    .filter((paper): paper is Paper => Boolean(paper))
    .filter((paper) => new Date(paper.published).getTime() >= cutoff)
    .slice(0, MAX_RESULTS);
}
