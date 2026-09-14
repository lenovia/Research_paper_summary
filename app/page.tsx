"use client";

import {
  ArrowUpRight,
  BookOpen,
  Check,
  Loader2,
  Search,
  Send,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { Paper } from "@/lib/types";

type Notice = {
  type: "ok" | "error";
  text: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function splitKeywords(value: string) {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const keywords = useMemo(() => splitKeywords(keywordInput), [keywordInput]);
  const selectedPapers = papers.filter((paper) => selectedIds.has(paper.id));
  const allSelected = papers.length > 0 && selectedIds.size === papers.length;

  async function searchPapers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!email.trim()) {
      setNotice({ type: "error", text: "Enter your email first." });
      return;
    }

    if (keywords.length === 0) {
      setNotice({
        type: "error",
        text: "Add at least one keyword before searching.",
      });
      return;
    }

    setIsSearching(true);
    setSelectedIds(new Set());

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      const data = (await response.json()) as {
        papers?: Paper[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Search failed.");
      }

      setPapers(data.papers ?? []);
      setNotice(
        data.papers?.length
          ? null
          : {
              type: "ok",
              text: "No ERIC records matched those keywords.",
            },
      );
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Search failed.",
      });
    } finally {
      setIsSearching(false);
    }
  }

  function togglePaper(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(papers.map((paper) => paper.id)));
  }

  async function sendSummary() {
    setNotice(null);

    if (selectedPapers.length === 0) {
      setNotice({ type: "error", text: "Select at least one paper to send." });
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/send-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, keywords, papers: selectedPapers }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Sending failed.");
      }

      setNotice({
        type: "ok",
        text: `Sent ${selectedPapers.length} summary${selectedPapers.length === 1 ? "" : "ies"} to ${email}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Sending failed.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <div className="mark" aria-hidden="true">
              <BookOpen size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="brand-title">Research Brief</h1>
              <p className="brand-subtitle">
                Education research, made readable
              </p>
            </div>
          </div>
        </header>

        <div className="window">
          <section className="query-panel">
            <p className="panel-kicker">Research digest</p>
            <h2 className="panel-title">Find papers worth reading.</h2>
            <p className="panel-copy">
              Enter your email and comma-separated keywords. Choose the results
              you want summarized in plain language.
            </p>

            <form className="form" onSubmit={searchPapers}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="field">
                <label htmlFor="keywords">Keywords</label>
                <input
                  id="keywords"
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder="K-12, AI tutor"
                />
              </div>

              <button className="search-button" disabled={isSearching}>
                {isSearching ? (
                  <Loader2 size={17} className="spin" aria-hidden="true" />
                ) : (
                  <Search size={17} aria-hidden="true" />
                )}
                {isSearching ? "Searching" : "Search ERIC"}
              </button>
            </form>

            {keywords.length > 0 ? (
              <div className="filters" aria-label="Active keywords">
                {keywords.map((keyword) => (
                  <span className="chip" key={keyword}>
                    {keyword}
                  </span>
                ))}
              </div>
            ) : null}

            {notice ? (
              <div className={`message ${notice.type}`} role="status">
                {notice.text}
              </div>
            ) : null}
          </section>

          <section className="results-panel">
            <div className="results-header">
              <div>
                <p className="panel-kicker">ERIC results</p>
                <h2>Research results</h2>
              </div>
              <span className="count">
                {papers.length
                  ? `${selectedIds.size} selected of ${papers.length}`
                  : "ERIC education index"}
              </span>
            </div>

            {papers.length > 0 ? (
              <>
                <div className="filters">
                  <button className="chip chip-button" onClick={toggleAll}>
                    <Check size={14} aria-hidden="true" />
                    {allSelected ? "Clear selection" : "Select all"}
                  </button>
                </div>

                <div className="paper-list">
                  {papers.map((paper) => {
                    const isSelected = selectedIds.has(paper.id);

                    return (
                      <article
                        className={`paper-card ${isSelected ? "selected" : ""}`}
                        key={paper.id}
                        onClick={() => togglePaper(paper.id)}
                      >
                        <label
                          className="check-wrap"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="sr-only">Select {paper.title}</span>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePaper(paper.id)}
                          />
                        </label>

                        <h3 className="paper-title">{paper.title}</h3>
                        <p className="meta">
                          <span>{formatDate(paper.published)}</span>
                          <span>{paper.fullTextAvailable ? "Full text PDF" : "Abstract only"}</span>
                          <span>{paper.authors.slice(0, 3).join(", ")}</span>
                          {paper.authors.length > 3 ? (
                            <span>+{paper.authors.length - 3} more</span>
                          ) : null}
                        </p>

                        <details
                          className="abstract"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <summary>Abstract</summary>
                          <p>{paper.abstract}</p>
                        </details>

                        <a
                          className="paper-link"
                          href={paper.link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Open paper
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="status">
                <div>
                  <strong>Start with keywords.</strong>
                  <span>
                    Search results will appear here with collapsible abstracts,
                    ERIC links, and selectable cards.
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <aside className="floating-send" aria-label="Send selected summaries">
        <div className="floating-copy">
          <strong>{selectedPapers.length || 0} selected</strong>
          <span>{email ? `Ready for ${email}` : "Enter an email first"}</span>
        </div>
        <button
          className="send-button"
          onClick={sendSummary}
          disabled={isSending || selectedPapers.length === 0}
        >
          {isSending ? (
            <Loader2 size={17} className="spin" aria-hidden="true" />
          ) : (
            <Send size={17} aria-hidden="true" />
          )}
          {isSending ? "Sending" : "Send Summary"}
        </button>
      </aside>
    </main>
  );
}
