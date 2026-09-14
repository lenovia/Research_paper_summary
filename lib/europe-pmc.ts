import { parseStringPromise } from "xml2js";
import type { Paper } from "@/lib/types";

const EUROPE_PMC_ENDPOINT =
  "https://www.ebi.ac.uk/europepmc/webservices/rest";
const MAX_RESULTS = 30;
const FULL_TEXT_CHAR_LIMIT = 22000;

type EuropePmcResult = {
  id?: string;
  source?: string;
  title?: string;
  abstractText?: string;
  authorString?: string;
  firstPublicationDate?: string;
  firstIndexDate?: string;
  journalInfo?: {
    journal?: {
      title?: string;
    };
  };
  pubTypeList?: {
    pubType?: string[];
  };
  fullTextIdList?: {
    fullTextId?: string[];
  };
  fullTextUrlList?: {
    fullTextUrl?: Array<{
      url?: string;
      documentStyle?: string;
      availability?: string;
    }>;
  };
};

function cleanText(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function oneWeekDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);

  const format = (date: Date) => date.toISOString().slice(0, 10);
  return {
    start: format(start),
    end: format(end),
  };
}

function buildQuery(keywords: string[]) {
  const { start, end } = oneWeekDateRange();
  const keywordQuery = keywords
    .map((keyword) => keyword.replace(/[()"]/g, " ").trim())
    .filter(Boolean)
    .map((keyword) => `"${keyword}"`)
    .join(" OR ");

  return `OPEN_ACCESS:y AND FIRST_PDATE:[${start} TO ${end}] AND (${keywordQuery})`;
}

function normalizeResult(result: EuropePmcResult): Paper | null {
  if (!result.id || !result.title) {
    return null;
  }

  const fullTextUrls = result.fullTextUrlList?.fullTextUrl ?? [];
  const htmlLink =
    fullTextUrls.find((url) => url.documentStyle === "html")?.url ??
    `https://europepmc.org/article/${result.source ?? "PMC"}/${result.id}`;
  const pdfLink = fullTextUrls.find((url) => url.documentStyle === "pdf")?.url;
  const published =
    result.firstPublicationDate ?? result.firstIndexDate ?? new Date().toISOString();

  return {
    id: `${result.source ?? "PMC"}:${result.id}`,
    externalId: result.id,
    source: "europe_pmc",
    title: cleanText(result.title),
    abstract: cleanText(result.abstractText ?? ""),
    authors: cleanText(result.authorString ?? "")
      .split(",")
      .map((author) => author.trim())
      .filter(Boolean),
    published,
    updated: published,
    link: htmlLink,
    pdfLink,
    journal: result.journalInfo?.journal?.title,
    categories: result.pubTypeList?.pubType ?? [],
    fullTextAvailable: Boolean(result.fullTextIdList?.fullTextId?.length),
  };
}

function collectText(node: unknown, parts: string[]) {
  if (typeof node === "string") {
    parts.push(node);
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, parts));
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record._ === "string") {
    parts.push(record._);
  }

  Object.entries(record).forEach(([key, value]) => {
    if (key !== "$") {
      collectText(value, parts);
    }
  });
}

export async function searchEuropePmc(keywords: string[]) {
  const filteredKeywords = keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (filteredKeywords.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    query: buildQuery(filteredKeywords),
    format: "json",
    pageSize: String(MAX_RESULTS),
    resultType: "core",
    sort: "FIRST_PDATE_D desc",
  });

  const response = await fetch(`${EUROPE_PMC_ENDPOINT}/search?${params}`, {
    next: {
      revalidate: 600,
    },
  });

  if (!response.ok) {
    throw new Error(`Europe PMC request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    resultList?: {
      result?: EuropePmcResult[];
    };
  };

  return (data.resultList?.result ?? [])
    .map(normalizeResult)
    .filter((paper): paper is Paper => Boolean(paper))
    .filter((paper) => paper.fullTextAvailable)
    .slice(0, MAX_RESULTS);
}

export async function getEuropePmcFullText(paper: Paper) {
  if (paper.source !== "europe_pmc" || !paper.externalId) {
    return "";
  }

  const response = await fetch(
    `${EUROPE_PMC_ENDPOINT}/${paper.externalId}/fullTextXML`,
    {
      next: {
        revalidate: 86400,
      },
    },
  );

  if (!response.ok) {
    return "";
  }

  const xml = await response.text();
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    mergeAttrs: false,
  });
  const parts: string[] = [];
  const article = parsed.article;

  collectText(article?.front?.["article-meta"]?.abstract, parts);
  collectText(article?.body, parts);

  return cleanText(parts.join(" ")).slice(0, FULL_TEXT_CHAR_LIMIT);
}
