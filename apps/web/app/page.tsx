"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Finding = {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: number;
  examples: string[];
};

type Scan = {
  id: string;
  url: string;
  status: "queued" | "running" | "completed" | "failed";
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  summary: { violations: number; passes: number; incomplete: number } | null;
  findings: Finding[];
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  const [url, setUrl] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Scan[]>([]);
  const [historyError, setHistoryError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function refreshHistory() {
    try {
      const response = await fetch(`${API}/api/scans?limit=10`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load scan history.");
      setHistory(body.scans as Scan[]);
      setHistoryError("");
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not load scan history.");
    }
  }

  useEffect(() => { void refreshHistory(); }, []);

  async function refreshScan(id: string) {
    const response = await fetch(`${API}/api/scans/${encodeURIComponent(id)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load scan.");
    setScan(body.scan as Scan);
    void refreshHistory();
    if (body.scan.status === "completed" || body.scan.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setBusy(false);
      void refreshHistory();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setScan(null);
    setBusy(true);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const response = await fetch(`${API}/api/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not start scan.");
      setScan(body.scan as Scan);
      void refreshHistory();
      const id = body.scan.id as string;
      pollRef.current = setInterval(() => {
        refreshScan(id).catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Failed to refresh scan.");
          setBusy(false);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        });
      }, 1800);
      await refreshScan(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const findings = scan?.findings ?? [];
  const severe = findings.filter((f) => f.impact === "critical" || f.impact === "serious").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="mark">✓</div>shipcheck</div>
        <a className="pill" href="#history">Scan history</a>
      </header>

      <section className="hero">
        <div className="eyebrow">Ship with confidence</div>
        <h1>Find website issues before your users do.</h1>
        <p className="lead">Run an accessibility audit on a public website. Get real findings, clear explanations, and links to practical fixes.</p>
        <form className="scanbox" onSubmit={submit}>
          <input
            aria-label="Website URL"
            type="url"
            required
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" disabled={busy}>{busy ? "Scanning…" : "Run free scan →"}</button>
        </form>
        <p className="note">Public HTTP(S) websites only. Do not submit private, internal, or sensitive URLs.</p>
        {error && <div className="error" role="alert">{error}</div>}
      </section>

      {scan && (
        <section className="report" aria-live="polite">
          <div className="report-head">
            <div>
              <h2>Accessibility report</h2>
              <div className="subtle">{scan.url}</div>
              <div className="subtle">Scan ID: {scan.id}</div>
            </div>
            <span className={`status ${scan.status === "completed" ? "done" : ""}`}>
              {scan.status === "running" ? "Running scan…" : scan.status}
            </span>
          </div>

          {scan.status === "failed" && <div className="error">{scan.error ?? "The scan failed."}</div>}

          {scan.status === "completed" && (
            <>
              <div className="metrics">
                <div className="metric"><strong>{scan.summary?.violations ?? 0}</strong><span>Violation rules</span></div>
                <div className="metric"><strong>{severe}</strong><span>Serious / critical rules</span></div>
                <div className="metric"><strong>{scan.summary?.passes ?? 0}</strong><span>Passed checks</span></div>
              </div>
              <p className="subtle">A violation rule can affect multiple page elements. Automated scans find common issues but cannot certify full WCAG conformance.</p>
              {findings.length === 0 ? (
                <div className="empty">No axe-core violations were reported for this page. Manual testing is still recommended.</div>
              ) : findings.map((finding) => (
                <article className="finding" key={finding.id}>
                  <div>
                    <span className={`tag ${finding.impact === "critical" || finding.impact === "serious" ? "critical" : finding.impact === "minor" ? "minor" : ""}`}>
                      {finding.impact ?? "unknown"}
                    </span>
                    <span className="finding-title">{finding.help}</span>
                  </div>
                  <p>{finding.description}</p>
                  <div className="subtle">{finding.nodes} affected element(s) · Rule: {finding.id}</div>
                  {finding.examples.length > 0 && (
                    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f7f9f7", borderRadius: 8, padding: 12, fontSize: 12 }}>{finding.examples.join("\n\n")}</pre>
                  )}
                  <a href={finding.helpUrl} target="_blank" rel="noreferrer">Read remediation guidance ↗</a>
                </article>
              ))}
            </>
          )}
        </section>
      )}

      {!scan && (
        <section className="report">
          <div className="report-head">
            <div><h2>What your scan checks</h2><div className="subtle">Start with useful, evidence-based accessibility feedback.</div></div>
            <span className="status">axe-core</span>
          </div>
          <div className="metrics">
            <div className="metric"><strong>Labels</strong><span>Form controls and accessible names</span></div>
            <div className="metric"><strong>Contrast</strong><span>Common text contrast problems</span></div>
            <div className="metric"><strong>ARIA</strong><span>Common semantic and attribute issues</span></div>
          </div>
        </section>
      )}

      <section className="report" id="history">
        <div className="report-head">
          <div><h2>Recent scans</h2><div className="subtle">History stored by this ShipCheck instance.</div></div>
          <button type="button" className="quiet" onClick={() => void refreshHistory()}>Refresh</button>
        </div>
        {historyError && <div className="error" role="alert">{historyError}</div>}
        {history.length === 0 && !historyError ? <div className="empty">No scans yet. Run your first public website audit above.</div> : (
          <div className="history-list">
            {history.map((item) => <button className="history-row" key={item.id} type="button" onClick={() => { setScan(item); setUrl(item.url); }}>
              <span><strong>{item.url}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
              <span className={`status ${item.status === "completed" ? "done" : ""}`}>{item.status}</span>
            </button>)}
          </div>
        )}
      </section>

      <footer className="footer">ShipCheck is an independent developer tool. Automated findings are a starting point, not a substitute for manual accessibility testing.</footer>
    </main>
  );
}
