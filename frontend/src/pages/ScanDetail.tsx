import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import { SEV_HEX, SEV_GLOW, CAT_PALETTE, categoryOf, posture, relativeTime } from "../lib/ui";
import { SEVERITIES, TOOLS } from "../api/types";
import type {
  ScanEvent,
  ScannerRunState,
  ScanProgressSnapshot,
  Severity,
  Tool,
  TriageStatus,
} from "../api/types";

const TABS: { key: TriageStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "suppressed", label: "Suppressed" },
];

export default function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const scanId = id ?? "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TriageStatus | "all">("all");
  const [sevFilter, setSevFilter] = useState<Severity | "">("");
  const [q, setQ] = useState("");

  const [scannerStates, setScannerStates] = useState<Partial<Record<Tool, ScannerRunState>>>({});
  const [scannerFindings, setScannerFindings] = useState<Partial<Record<Tool, number>>>({});

  const scanQuery = useQuery({ queryKey: ["scan", scanId], queryFn: () => api.getScan(scanId), enabled: !!scanId });
  const allQuery = useQuery({ queryKey: ["findings", scanId, {}], queryFn: () => api.getFindings(scanId), enabled: !!scanId });

  const liveStatus = scanQuery.data?.status;
  const isActive = liveStatus === "queued" || liveStatus === "running";

  useEffect(() => {
    if (!scanId || !isActive) return;
    const es = new EventSource(api.scanEventsUrl(scanId));
    const finish = () => {
      es.close();
      queryClient.invalidateQueries({ queryKey: ["scan", scanId] });
      queryClient.invalidateQueries({ queryKey: ["findings", scanId] });
    };
    es.addEventListener("snapshot", (e) => {
      try {
        const snap = JSON.parse((e as MessageEvent).data) as ScanProgressSnapshot;
        const states: Partial<Record<Tool, ScannerRunState>> = {};
        const found: Partial<Record<Tool, number>> = {};
        for (const t of TOOLS) {
          if (snap[`scanner:${t}`]) states[t] = snap[`scanner:${t}`] as ScannerRunState;
          if (snap[`findings:${t}`] !== undefined) found[t] = Number(snap[`findings:${t}`]);
        }
        setScannerStates(states);
        setScannerFindings(found);
      } catch { /* ignore */ }
    });
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as ScanEvent;
        if (ev.type === "scanner") {
          setScannerStates((p) => ({ ...p, [ev.scanner]: ev.state }));
          if (ev.findings !== undefined) setScannerFindings((p) => ({ ...p, [ev.scanner]: ev.findings }));
        }
      } catch { /* ignore */ }
    };
    es.addEventListener("end", finish);
    es.onerror = () => es.close();
    return () => es.close();
  }, [scanId, isActive, queryClient]);

  const all = useMemo(() => allQuery.data ?? [], [allQuery.data]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of all) m.set(categoryOf(f), (m.get(categoryOf(f)) ?? 0) + 1);
    const arr = [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...arr.map((c) => c.count));
    return arr.slice(0, 8).map((c, i) => ({ ...c, pct: Math.round((c.count / max) * 100), color: CAT_PALETTE[i % CAT_PALETTE.length] }));
  }, [all]);

  const byTool = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of all) m[f.tool] = (m[f.tool] ?? 0) + 1;
    return m;
  }, [all]);

  const filtered = useMemo(
    () =>
      all.filter((f) => {
        if (tab !== "all" && f.triage_status !== tab) return false;
        if (sevFilter && f.severity !== sevFilter) return false;
        if (q.trim()) {
          const s = q.trim().toLowerCase();
          if (!(`${f.title} ${f.message} ${f.file_path} ${f.cwe ?? ""}`.toLowerCase().includes(s))) return false;
        }
        return true;
      }),
    [all, tab, sevFilter, q],
  );

  if (scanQuery.isLoading) {
    return <div className="mx-auto max-w-[1320px] px-8 pt-8"><div className="card px-5 py-12 text-center text-[13px] text-faint">loading scan<span className="blink">_</span></div></div>;
  }
  if (scanQuery.error || !scanQuery.data) {
    const err = scanQuery.error;
    return (
      <div className="mx-auto max-w-[1320px] px-8 pt-8">
        <div className="rounded-xl border border-crit/30 bg-crit/10 px-4 py-3 text-[13px] text-crit">
          {err instanceof ApiError ? (err.status === 404 ? "Scan not found." : `API unreachable — ${err.message}`) : "Failed to load scan."}
        </div>
      </div>
    );
  }

  const scan = scanQuery.data;
  const { score, grade } = posture(scan.counts);
  const dash = 226;
  const offset = Math.round(dash * (1 - score / 100));

  return (
    <div className="mx-auto max-w-[1320px] px-8 pb-12 pt-6">
      <Link to="/" className="mono mb-4 inline-flex items-center gap-2 text-[12.5px] text-faint hover:text-ink">
        <span>←</span> scans
      </Link>

      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] uppercase tracking-wide text-lime">{scan.source_type}</span>
            <h1 className="m-0 truncate text-[23px] font-semibold tracking-tight text-head">{scan.source_ref}</h1>
          </div>
          <p className="m-0 mt-1 text-[13.5px] text-faint">
            {scan.counts.total} findings · scanned against <span className="text-dim">OWASP Top 10 + CWE</span> · last run {relativeTime(scan.finished_at)}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <StatusBadge status={scan.status} />
          <a href={api.sarifUrl(scan.id)} download className="rounded-lg border border-line2 px-3 py-2 text-[12.5px] text-dim transition-colors hover:border-fainter hover:text-ink">
            ↓ SARIF
          </a>
        </div>
      </div>

      {/* stat row */}
      <div className="mb-3.5 flex flex-wrap gap-3.5">
        <div className="flex w-[268px] flex-shrink-0 items-center gap-[18px] rounded-[14px] border border-line bg-panel px-5 py-[18px]">
          <div className="relative h-[84px] w-[84px] flex-shrink-0">
            <svg width="84" height="84" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="36" fill="none" stroke="#1f2229" strokeWidth="8" />
              <circle cx="42" cy="42" r="36" fill="none" stroke="#c4f24a" strokeWidth="8" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={offset} transform="rotate(-90 42 42)" style={{ transition: "stroke-dashoffset .6s ease" }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="mono text-[26px] font-bold leading-none text-head">{grade}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-faint">Security posture</span>
            <span className="mono text-[22px] font-semibold leading-none text-head">{score}<span className="text-[14px] text-fainter">/100</span></span>
          </div>
        </div>

        {SEVERITIES.filter((s) => s !== "info").map((sev) => (
          <button key={sev} onClick={() => setSevFilter(sevFilter === sev ? "" : (sev as Severity))} className={`flex flex-1 flex-col gap-3.5 rounded-[14px] border bg-panel px-[18px] py-4 text-left transition-colors ${sevFilter === sev ? "border-lime/40" : "border-line hover:border-[#2c3038]"}`}>
            <div className="flex items-center gap-2">
              <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: SEV_HEX[sev], boxShadow: `0 0 8px ${SEV_GLOW[sev]}` }} />
              <span className="text-[12.5px] font-medium capitalize text-dim">{sev}</span>
            </div>
            <span className="mono text-[34px] font-semibold leading-[.9] text-head">{scan.counts[sev]}</span>
          </button>
        ))}
      </div>

      {/* two column */}
      <div className="flex flex-wrap items-start gap-3.5 lg:flex-nowrap">
        {/* findings */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-[14px] border border-line bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex gap-0.5 rounded-lg border border-line2 bg-bar p-[3px]">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1 text-[12.5px] transition-colors ${tab === t.key ? "bg-lime font-semibold text-base" : "text-dim hover:text-ink"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings, files, CWE…" className="field w-[220px] max-w-full" />
          </div>

          <div className="grid grid-cols-[110px_1fr_120px] gap-3.5 border-b border-line bg-bar px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.4px] text-fainter sm:grid-cols-[110px_1fr_130px_120px]">
            <span>Severity</span><span>Finding</span><span className="hidden sm:block">Category</span><span className="text-right">Status</span>
          </div>

          {allQuery.isLoading ? (
            <div className="px-5 py-10 text-center text-[13px] text-faint">loading findings<span className="blink">_</span></div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-faint">
              {isActive ? "Scanners running — findings will appear live." : "No findings match this view."}
            </div>
          ) : (
            filtered.map((f, i) => (
              <div key={f.id} onClick={() => navigate(`/scans/${scanId}/findings/${f.id}`)} className={`row-in grid cursor-pointer grid-cols-[110px_1fr_120px] items-center gap-3.5 border-b border-line-soft px-5 py-3.5 transition-colors last:border-0 hover:bg-[#13161b] sm:grid-cols-[110px_1fr_130px_120px] ${f.triage_status !== "open" ? "opacity-55" : ""}`} style={{ animationDelay: `${Math.min(i, 16) * 20}ms` }}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: SEV_HEX[f.severity] }} />
                  <span className="text-[12.5px] font-semibold capitalize" style={{ color: SEV_HEX[f.severity] }}>{f.severity}</span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-ink">{f.title}</div>
                  <div className="mono mt-0.5 truncate text-[11.5px] text-[#646a74]">{f.file_path}{f.line_start ? `:${f.line_start}` : ""} · {f.cwe ?? "—"} · {f.tool}</div>
                </div>
                <div className="hidden sm:block"><span className="rounded-md border border-line2 bg-line-soft px-2 py-[3px] text-[11.5px] text-dim">{categoryOf(f)}</span></div>
                <div className="flex items-center justify-end gap-2.5">
                  <span className="text-[11.5px] capitalize text-faint">{f.triage_status.replace("_", " ")}</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3f444c" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
                </div>
              </div>
            ))
          )}
        </div>

        {/* right column */}
        <div className="flex w-full flex-shrink-0 flex-col gap-3.5 lg:w-[336px]">
          <div className="rounded-[14px] border border-line bg-panel px-5 py-[18px]">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-head">Vulnerability categories</span>
              <span className="mono text-[11px] text-fainter">CWE</span>
            </div>
            <div className="flex flex-col gap-3">
              {categories.length === 0 ? (
                <span className="text-[12.5px] text-faint">No findings yet.</span>
              ) : (
                categories.map((c) => (
                  <div key={c.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-[#c2c7ce]">{c.name}</span>
                      <span className="mono text-faint">{c.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-line-soft">
                      <div className="h-full rounded" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[14px] border border-line bg-panel px-5 py-[18px]">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-head">Scanner gate</span>
              <span className="mono flex items-center gap-1.5 text-[11px] text-fainter">
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "pulse-dot" : ""}`} style={{ background: isActive ? "#5cb8ff" : "#4ade80" }} />
                {isActive ? "live" : "idle"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {TOOLS.map((tool) => {
                const st: ScannerRunState = isActive ? (scannerStates[tool] ?? "pending") : "done";
                const count = isActive ? scannerFindings[tool] : byTool[tool];
                const color = st === "error" ? "#fb6f7e" : st === "running" ? "#5cb8ff" : st === "done" ? "#4ade80" : "#5a6068";
                const note = st === "running" ? "scanning…" : st === "pending" ? "queued" : st === "error" ? "failed" : `done · ${count ?? 0} finding${count === 1 ? "" : "s"}`;
                return (
                  <div key={tool} className="flex items-center gap-3 rounded-[9px] border border-[#1a1d23] bg-bar px-2.5 py-2.5">
                    <span className={`h-[9px] w-[9px] flex-shrink-0 rounded-full ${st === "running" ? "pulse-dot" : ""}`} style={{ background: color }} />
                    <div className="min-w-0 flex-1">
                      <div className="mono truncate text-[12.5px] text-ink">{tool}</div>
                      <div className="truncate text-[11px] text-fainter">{note}</div>
                    </div>
                    <span className="text-[11px] font-semibold capitalize" style={{ color }}>{st}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
