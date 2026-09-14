export type Paper = {
  id: string;
  source: "eric" | "europe_pmc" | "arxiv";
  externalId?: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  updated: string;
  link: string;
  pdfLink?: string;
  categories: string[];
  fullTextAvailable?: boolean;
  journal?: string;
  fullText?: string;
};

export type PaperSummary = {
  paperId: string;
  title: string;
  link: string;
  whyItMatters: string;
  plainLanguageSummary: string;
  keyTakeaways: string[];
  termsExplained: {
    term: string;
    explanation: string;
  }[];
};
