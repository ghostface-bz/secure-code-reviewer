import { TOOLS } from "../api/types";
import type { ScannerRunState, Tool } from "../api/types";

const STATE_STYLES: Record<ScannerRunState, string> = {
  pending: "border-gray-200 bg-gray-50 text-gray-500",
  running: "border-blue-300 bg-blue-50 text-blue-700",
  done: "border-green-300 bg-green-50 text-green-700",
  error: "border-red-300 bg-red-50 text-red-700",
};

const STATE_LABEL: Record<ScannerRunState, string> = {
  pending: "queued",
  running: "running…",
  done: "done",
  error: "error",
};

interface Props {
  states: Partial<Record<Tool, ScannerRunState>>;
  findings: Partial<Record<Tool, number>>;
}

/** Per-scanner live status chips, driven by the SSE progress stream. */
export default function ScannerProgress({ states, findings }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {TOOLS.map((tool) => {
        const state = states[tool] ?? "pending";
        const count = findings[tool];
        return (
          <div
            key={tool}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STATE_STYLES[state]}`}
          >
            {state === "running" ? (
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            ) : null}
            <span className="font-mono">{tool}</span>
            <span className="opacity-70">{STATE_LABEL[state]}</span>
            {state === "done" && count !== undefined ? (
              <span className="rounded bg-white/70 px-1 tabular-nums">{count}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
