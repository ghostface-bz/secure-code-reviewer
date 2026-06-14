import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";

type SourceMode = "zip" | "git";

export default function NewScan() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<SourceMode>("zip");
  const [file, setFile] = useState<File | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (mode === "zip" && !file) return setError("Choose a .zip archive to upload.");
    if (mode === "git" && !gitUrl.trim()) return setError("Enter a public git repository URL.");

    setSubmitting(true);
    try {
      const scan =
        mode === "zip"
          ? await api.createScanFromZip(file as File)
          : await api.createScanFromGit(gitUrl.trim());
      navigate(`/scans/${scan.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const modeBtn = (m: SourceMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 rounded-md px-3 py-2 text-[12.5px] font-medium transition-colors ${
        mode === m ? "bg-lime text-base" : "text-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-xl px-8 pb-12 pt-7">
      <h1 className="m-0 text-[23px] font-semibold tracking-tight text-head">New scan</h1>
      <p className="m-0 mb-5 mt-1 text-[13.5px] text-faint">
        Scanners run in network-isolated sandboxes — no code leaves the host.
      </p>

      <div className="mb-3.5 flex gap-0.5 rounded-lg border border-line2 bg-bar p-[3px]">
        {modeBtn("zip", "Upload .zip")}
        {modeBtn("git", "Git URL")}
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 p-4">
        {mode === "zip" ? (
          <label
            htmlFor="zip-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line2 bg-bar px-4 py-9 text-center transition-colors hover:border-lime/50"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7c828c" strokeWidth="1.6"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            <span className="text-[13.5px] text-ink">{file ? file.name : "Drop or choose a .zip archive"}</span>
            <span className="text-[11px] uppercase tracking-wide text-fainter">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "max 50 MB"}</span>
            <input id="zip-file" type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          </label>
        ) : (
          <div>
            <label htmlFor="git-url" className="mb-1.5 block text-[12px] font-medium text-faint">Public git repository</label>
            <div className="flex items-center rounded-lg border border-line2 bg-bar focus-within:border-lime/55">
              <span className="mono select-none px-2.5 text-lime">$</span>
              <input
                id="git-url"
                type="text"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="mono flex-1 border-0 bg-transparent py-2.5 pr-3 text-[13px] text-ink outline-none placeholder:text-fainter"
              />
            </div>
          </div>
        )}

        {error ? <div className="rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-[12.5px] text-crit">{error}</div> : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-lime px-4 py-2.5 text-[13px] font-semibold text-base transition-colors hover:bg-lime-bright disabled:cursor-not-allowed disabled:opacity-50"
          style={{ boxShadow: "0 4px 14px rgba(196,242,74,.18)" }}
        >
          {submitting ? <>dispatching<span className="blink">_</span></> : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a0b0d" stroke="#0a0b0d" strokeWidth="2"><path d="M5 4v16M5 4l13 8-13 8" /></svg>
              Run scan
            </>
          )}
        </button>
      </form>
    </div>
  );
}
