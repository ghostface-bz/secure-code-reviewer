import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import SeverityBadge from "../components/SeverityBadge";
import { SEV_HEX, TRIAGE_PILL, relativeTime } from "../lib/ui";
import { TRIAGE_LABELS, TRIAGE_STATUSES } from "../api/types";
import type { Finding, TriageStatus } from "../api/types";

function cweUrl(cwe: string | null): string | null {
  const m = cwe?.match(/CWE-(\d+)/i);
  return m ? `https://cwe.mitre.org/data/definitions/${m[1]}.html` : null;
}

/** Honest roadmap teaser standing in for an AI-only capability. */
function RoadmapCard({ title, badge, body }: { title: string; badge: string; body: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-panel p-5">
      <div className="mb-2 flex items-center gap-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4f24a" strokeWidth="1.8">
          <path d="M12 2v6M12 2 9 5M12 2l3 3" /><circle cx="12" cy="15" r="6" /><path d="M9.5 15l1.7 1.7 3.3-3.4" />
        </svg>
        <span className="text-[14px] font-semibold text-head">{title}</span>
        <span className="rounded-md border border-lime/30 bg-lime/10 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-lime">{badge}</span>
      </div>
      <p className="m-0 text-[13px] leading-relaxed text-faint">{body}</p>
    </div>
  );
}

export default function FindingDetail() {
  const { id, fid } = useParams<{ id: string; fid: string }>();
  const scanId = id ?? "";
  const queryClient = useQueryClient();

  const findingsQuery = useQuery({
    queryKey: ["findings", scanId, {}],
    queryFn: () => api.getFindings(scanId),
    enabled: !!scanId,
  });
  const scanQuery = useQuery({ queryKey: ["scan", scanId], queryFn: () => api.getScan(scanId), enabled: !!scanId });

  const finding: Finding | undefined = findingsQuery.data?.find((f) => f.id === fid);

  const sourceQuery = useQuery({
    queryKey: ["source", scanId, finding?.file_path, finding?.line_start],
    queryFn: () => api.getSource(scanId, finding!.file_path, finding!.line_start ?? 0),
    enabled: !!finding?.file_path,
    retry: false,
  });

  const triageMutation = useMutation({
    mutationFn: (status: TriageStatus) => api.updateTriage(scanId, fid!, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["findings", scanId] }),
  });

  if (findingsQuery.isLoading) {
    return <div className="mx-auto max-w-[1320px] px-8 pt-8"><div className="card px-5 py-12 text-center text-[13px] text-faint">loading<span className="blink">_</span></div></div>;
  }
  if (!finding) {
    return (
      <div className="mx-auto max-w-[1320px] px-8 pt-8">
        <div className="rounded-xl border border-crit/30 bg-crit/10 px-4 py-3 text-[13px] text-crit">Finding not found.</div>
        <Link to={`/scans/${scanId}`} className="mt-3 inline-block text-[13px] text-lime hover:underline">← back to scan</Link>
      </div>
    );
  }

  const hex = SEV_HEX[finding.severity];
  const pill = TRIAGE_PILL[finding.triage_status];

  return (
    <div className="mx-auto max-w-[1320px] px-8 pb-12 pt-6">
      <Link to={`/scans/${scanId}`} className="mono mb-4 inline-flex items-center gap-2 text-[13px] text-faint hover:text-ink">
        <span>←</span> findings <span className="text-fainter">/</span> <span className="text-dim">{finding.cwe ?? finding.rule_id}</span>
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <SeverityBadge severity={finding.severity} variant="pill" />
            {finding.cwe ? <span className="mono text-[12px] text-faint">{finding.cwe}</span> : null}
            {finding.owasp ? <span className="mono text-[12px] text-faint">{finding.owasp}</span> : null}
          </div>
          <h1 className="m-0 mb-2 text-[24px] font-semibold tracking-tight text-head">{finding.title}</h1>
          <div className="mono text-[13px] text-faint">{finding.file_path}{finding.line_start ? `:${finding.line_start}` : ""}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <select
            value={finding.triage_status}
            disabled={triageMutation.isPending}
            onChange={(e) => triageMutation.mutate(e.target.value as TriageStatus)}
            className="field"
          >
            {TRIAGE_STATUSES.map((t) => <option key={t} value={t}>{TRIAGE_LABELS[t]}</option>)}
          </select>
          <button
            onClick={() => triageMutation.mutate("resolved")}
            disabled={triageMutation.isPending || finding.triage_status === "resolved"}
            className="flex items-center gap-1.5 rounded-lg bg-lime px-3.5 py-2 text-[13px] font-semibold text-base transition-colors hover:bg-lime-bright disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0d" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
            Mark resolved
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-[18px] lg:flex-nowrap">
        {/* left */}
        <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
          {/* code */}
          <div className="overflow-hidden rounded-[14px] border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line bg-bar px-4 py-3">
              <span className="mono text-[12.5px] text-dim">{finding.file_path}</span>
              <span className="text-[11px] text-fainter">detected by {finding.tool}</span>
            </div>
            {sourceQuery.isLoading ? (
              <div className="px-5 py-8 text-center text-[12.5px] text-faint">loading source<span className="blink">_</span></div>
            ) : sourceQuery.data ? (
              <div className="mono overflow-x-auto py-2 text-[13px] leading-[1.85]">
                {sourceQuery.data.lines.map((ln) => {
                  const focused = ln.n === sourceQuery.data!.focus;
                  return (
                    <div key={ln.n} className="flex" style={focused ? { background: `${hex}1a`, borderLeft: `2px solid ${hex}` } : undefined}>
                      <span className="w-12 flex-shrink-0 select-none pr-4 text-right" style={{ color: focused ? hex : "#3f444c" }}>{ln.n}</span>
                      <span className="whitespace-pre pr-6 text-[#c2c7ce]">{ln.text || " "}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-7 text-[12.5px] text-faint">
                Source preview isn't available for this scan
                {finding.line_start ? <> — finding is at <span className="mono text-dim">{finding.file_path}:{finding.line_start}</span>.</> : "."}
              </div>
            )}
          </div>

          <RoadmapCard
            title="Data-flow trace"
            badge="AI review"
            body="Taint tracking — source → propagation → sink — arrives with the agentic AI reviewer. It will read the surrounding code to show exactly how untrusted input reaches this finding."
          />
          <RoadmapCard
            title="Suggested fix"
            badge="AI review"
            body="One-click remediation (a parameterized-query / sanitized patch proposed as a PR) ships with the AI reviewer layer. For now, follow the remediation guidance on the right."
          />
        </div>

        {/* right */}
        <div className="flex w-full flex-shrink-0 flex-col gap-3.5 lg:w-[320px]">
          <div className="rounded-[14px] border border-line bg-panel px-5 py-1.5">
            {[
              ["Status", <span key="s" className="rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold capitalize" style={{ color: pill.c, background: pill.bg }}>{finding.triage_status.replace("_", " ")}</span>],
              ["Severity", <span key="v" className="text-[12.5px] font-semibold capitalize" style={{ color: hex }}>{finding.severity}</span>],
              ["Weakness", <span key="w" className="mono text-[12px] text-ink">{finding.cwe ?? "—"}</span>],
              ["OWASP", <span key="o" className="mono text-[12px] text-ink">{finding.owasp ?? "—"}</span>],
              ["Scanner", <span key="sc" className="text-[12.5px] font-medium text-ink">{finding.tool}</span>],
              ["Rule", <span key="r" className="mono max-w-[170px] truncate text-[11.5px] text-ink" title={finding.rule_id}>{finding.rule_id}</span>],
              ["Detected", <span key="d" className="text-[12.5px] text-ink">{relativeTime(scanQuery.data?.created_at ?? null)}</span>],
            ].map(([label, value], i, arr) => (
              <div key={label as string} className={`flex items-center justify-between py-[13px] ${i < arr.length - 1 ? "border-b border-line-soft" : ""}`}>
                <span className="text-[12.5px] text-faint">{label}</span>
                {value}
              </div>
            ))}
          </div>

          <div className="rounded-[14px] border border-line bg-panel px-5 py-[18px]">
            <div className="mb-2.5 text-[14px] font-semibold text-head">Remediation</div>
            <p className="m-0 text-[13px] leading-relaxed text-dim">{finding.message}</p>
            <div className="mt-4 flex flex-col gap-2">
              {cweUrl(finding.cwe) ? (
                <a href={cweUrl(finding.cwe)!} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[12.5px] text-sky hover:underline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                  {finding.cwe} reference
                </a>
              ) : null}
              <a href="https://owasp.org/www-project-top-ten/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[12.5px] text-sky hover:underline">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                OWASP Top 10
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
