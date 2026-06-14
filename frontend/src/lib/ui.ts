import type { ScanStatus, Severity, SeverityCounts, TriageStatus } from "../api/types";

/** Hex per severity — matches the Caret palette / index.css @theme. */
export const SEV_HEX: Record<Severity, string> = {
  critical: "#fb6f7e",
  high: "#ff9d4d",
  medium: "#ffd24d",
  low: "#5cb8ff",
  info: "#8b95a3",
};

export const SEV_GLOW: Record<Severity, string> = {
  critical: "rgba(251,111,126,.6)",
  high: "rgba(255,157,77,.6)",
  medium: "rgba(255,210,77,.55)",
  low: "rgba(92,184,255,.55)",
  info: "rgba(139,149,163,.45)",
};

/** Tailwind text colour utility per severity (tokens registered in @theme). */
export const SEV_TEXT: Record<Severity, string> = {
  critical: "text-crit",
  high: "text-high",
  medium: "text-med",
  low: "text-low",
  info: "text-info",
};

export const STATUS_HEX: Record<ScanStatus, string> = {
  queued: "#8b95a3",
  running: "#5cb8ff",
  completed: "#4ade80",
  failed: "#fb6f7e",
};

export const TRIAGE_PILL: Record<TriageStatus, { c: string; bg: string }> = {
  open: { c: "#e0e3e8", bg: "rgba(255,255,255,.07)" },
  false_positive: { c: "#8b95a3", bg: "rgba(139,149,163,.12)" },
  resolved: { c: "#4ade80", bg: "rgba(74,222,128,.13)" },
  suppressed: { c: "#ffd24d", bg: "rgba(255,210,77,.12)" },
};

/** Weighted posture score (0–100) + letter grade, derived from severity counts. */
export function posture(counts: SeverityCounts): { score: number; grade: string } {
  const penalty = counts.critical * 16 + counts.high * 7 + counts.medium * 3 + counts.low * 1;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const grade =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade };
}

/** Coarse vulnerability category derived from a finding's CWE (falls back by tool). */
const CWE_CATEGORY: Record<string, string> = {
  "CWE-89": "Injection", "CWE-78": "Injection", "CWE-77": "Injection", "CWE-94": "Injection",
  "CWE-79": "XSS", "CWE-80": "XSS",
  "CWE-798": "Secrets", "CWE-259": "Secrets", "CWE-321": "Secrets", "CWE-522": "Secrets",
  "CWE-22": "Path Traversal", "CWE-23": "Path Traversal",
  "CWE-327": "Cryptography", "CWE-328": "Cryptography", "CWE-326": "Cryptography", "CWE-916": "Cryptography",
  "CWE-502": "Deserialization",
  "CWE-209": "Info Leak", "CWE-200": "Info Leak", "CWE-532": "Info Leak",
  "CWE-770": "Misconfig", "CWE-16": "Misconfig", "CWE-489": "Misconfig", "CWE-668": "Misconfig",
  "CWE-352": "CSRF", "CWE-601": "Open Redirect", "CWE-918": "SSRF", "CWE-611": "XXE",
  "CWE-287": "Auth", "CWE-306": "Auth", "CWE-863": "Authz", "CWE-862": "Authz",
  "CWE-20": "Validation", "CWE-400": "DoS", "CWE-1333": "DoS", "CWE-79x": "XSS",
};

export const CAT_PALETTE = ["#fb6f7e", "#c4f24a", "#ffd24d", "#5cb8ff", "#ff9d4d", "#5eead4", "#a78bfa", "#9aa0aa"];

export function categoryOf(f: { cwe: string | null; tool: string }): string {
  if (f.cwe && CWE_CATEGORY[f.cwe]) return CWE_CATEGORY[f.cwe];
  return f.tool === "gitleaks" ? "Secrets" : f.tool === "trivy" ? "Dependencies" : "Other";
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
