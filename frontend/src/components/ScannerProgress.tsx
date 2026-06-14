import { TOOLS } from "../api/types";
import type { ScannerRunState, Tool } from "../api/types";

const STATE_LABEL: Record<ScannerRunState, string> = {
  pending: "queued",
  running: "scanning",
  done: "done",
  error: "error",
};

const STATE_TEXT: Record<ScannerRunState, string> = {
  pending: "text-faint",
  running: "text-amber",
  done: "text-ok",
  error: "text-crit",
};

interface Props {
  states: Partial<Record<Tool, ScannerRunState>>;
  findings: Partial<Record<Tool, number>>;
}

/** Per-scanner live status: name, state, a sweep/fill track, finding count. */
export default function ScannerProgress({ states, findings }: Props) {
  return (
    <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
      {TOOLS.map((tool) => {
        const state = states[tool] ?? "pending";
        const count = findings[tool];
        const track =
          state === "running"
            ? "sweep"
            : state === "done"
              ? "bg-ok"
              : state === "error"
                ? "bg-crit"
                : "bg-raised";
        return (
          <div key={tool} className="bg-panel px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className={`dot ${state === "running" ? "dot-live" : ""} ${STATE_TEXT[state]}`} />
                {tool}
              </span>
              <span className={`label ${STATE_TEXT[state]}`}>{STATE_LABEL[state]}</span>
            </div>
            <div className={`mt-2 h-[3px] w-full ${track}`} />
            <div className="mt-1.5 flex justify-end text-[0.66rem] text-dim">
              {state === "done" && count !== undefined ? (
                <span className="tnum">
                  {count} finding{count === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-faint">&nbsp;</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
