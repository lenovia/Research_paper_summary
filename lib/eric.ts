import type { Paper } from "@/lib/types";
import { createRequire } from "module";

const ERIC_ENDPOINT = "https://api.ies.ed.gov/eric/";
const ERIC_PDF_ENDPOINT = "https://files.eric.ed.gov/fulltext";
const MAX_RESULTS = 20;
const FULL_TEXT_CHAR_LIMIT = 22000;

type EricDoc = {
  id: string;
  title?: string;
  author?: string[];
  description?: string;
  subject?: string[];
  publicationtype?: string[];
  publicationdateyear?: number;
  publisher?: string;
  peerreviewed?: "T" | "F";
};

function cleanText(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x0023;/g, "#")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteTerm(value: string) {
  return `"${value}"`;
}

function expandKeyword(keyword: string) {
  const normalized = keyword.toLowerCase();
  const cleanKeyword = keyword.replace(/[()"]/g, " ").trim();
  const terms = new Set<string>();

  if (cleanKeyword) {
    terms.add(cleanKeyword);
  }

  if (/\bai\b|artificial intelligence|genai|generative ai/.test(normalized)) {
    terms.add("AI");
    terms.add("artificial intelligence");
    terms.add("generative artificial intelligence");
  }

  if (/k-?12|elementary|secondary|school/.test(normalized)) {
    terms.add("K-12");
    terms.add("Elementary Secondary Education");
    terms.add("schools");
  }

  if (/tutor|tutoring|personalized learning/.test(normalized)) {
    terms.add("AI tutor");
    terms.add("AI tutoring");
    terms.add("intelligent tutoring");
    terms.add("intelligent tutoring systems");
    terms.add("tutoring systems");
    terms.add("personalized learning");
  }

  return Array.from(terms);
}

function buildQuery(keywords: string[]) {
  return keywords
    .map(expandKeyword)
    .filter((terms) => terms.length > 0)
    .map((terms) => {
      const query = terms.map(quoteTerm).join(" OR ");
      return terms.length > 1 ? `(${query})` : query;
    })
    .join(" AND ");
}

async function fetchEricSearch(params: URLSearchParams, attempt = 1): Promise<Response> {
  const response = await fetch(`${ERIC_ENDPOINT}?${params}`, {
    next: {
      revalidate: 600,
    },
  });

  if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
    return fetchEricSearch(params, attempt + 1);
  }

  return response;
}

function sortPapers(a: Paper, b: Paper) {
  const aYear = Number(a.published.slice(0, 4));
  const bYear = Number(b.published.slice(0, 4));

  if (aYear !== bYear) {
    return bYear - aYear;
  }

  if (a.fullTextAvailable !== b.fullTextAvailable) {
    return a.fullTextAvailable ? -1 : 1;
  }

  return 0;
}

function ericPdfUrl(id: string) {
  return `${ERIC_PDF_ENDPOINT}/${id}.pdf`;
}

function normalizeDoc(doc: EricDoc): Paper | null {
  if (!doc.id || !doc.title) {
    return null;
  }

  const publishedYear = doc.publicationdateyear ?? new Date().getFullYear();
  const pdfLikelyAvailable = doc.id.startsWith("ED");

  return {
    id: `ERIC:${doc.id}`,
    externalId: doc.id,
    source: "eric",
    title: cleanText(doc.title),
    abstract: cleanText(doc.description ?? ""),
    authors: doc.author ?? [],
    published: `${publishedYear}-01-01`,
    updated: `${publishedYear}-01-01`,
    link: `https://eric.ed.gov/?id=${doc.id}`,
    pdfLink: pdfLikelyAvailable ? ericPdfUrl(doc.id) : undefined,
    journal: doc.publisher,
    categories: [...(doc.publicationtype ?? []), ...(doc.subject ?? [])],
    fullTextAvailable: pdfLikelyAvailable,
  };
}

async function checkPdfAvailability(paper: Paper) {
  if (paper.source !== "eric" || !paper.externalId?.startsWith("ED")) {
    return {
      ...paper,
      fullTextAvailable: false,
      pdfLink: undefined,
    };
  }

  try {
    const response = await fetch(ericPdfUrl(paper.externalId), {
      method: "HEAD",
      next: {
        revalidate: 86400,
      },
    });

    if (!response.ok) {
      return {
        ...paper,
        fullTextAvailable: false,
        pdfLink: undefined,
      };
    }

    return paper;
  } catch {
    return {
      ...paper,
      fullTextAvailable: false,
      pdfLink: undefined,
    };
  }
}

export async function searchEric(keywords: string[]) {
  const filteredKeywords = keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (filteredKeywords.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    search: buildQuery(filteredKeywords),
    format: "json",
    rows: String(MAX_RESULTS),
  });

  const response = await fetchEricSearch(params);

  if (!response.ok) {
    if (response.status === 504) {
      throw new Error(
        "ERIC timed out while searching. Try fewer or broader keywords, such as K-12, AI tutor.",
      );
    }

    throw new Error(`ERIC request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    response?: {
      docs?: EricDoc[];
    };
  };

  const papers = (data.response?.docs ?? [])
    .map(normalizeDoc)
    .filter((paper): paper is Paper => Boolean(paper))
    .slice(0, MAX_RESULTS);

  const checkedPapers = await Promise.all(papers.map(checkPdfAvailability));

  return checkedPapers.sort(sortPapers);
}

export async function getEricFullText(paper: Paper) {
  if (paper.source !== "eric" || !paper.externalId?.startsWith("ED")) {
    return "";
  }

  const response = await fetch(ericPdfUrl(paper.externalId), {
    cache: "no-store",
  });

  if (!response.ok) {
    return "";
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const require = createRequire(import.meta.url);
  const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ partial: [1, 12] });
    return cleanText(result.text).slice(0, FULL_TEXT_CHAR_LIMIT);
  } finally {
    await parser.destroy();
  }
}
