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
      className={`flex-1 border px-3 py-2 text-xs uppercase tracking-[0.14em] transition-colors ${
        mode === m
          ? "border-amber/50 bg-amber/10 text-amber"
          : "border-line text-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <div className="label">new analysis</div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Submit a target</h1>
        <p className="mt-1 text-xs text-dim">
          Scanners run in network-isolated sandboxes. No code leaves the host.
        </p>
      </div>

      <div className="flex gap-px border border-line bg-line">{modeBtn("zip", "Upload .zip")}{modeBtn("git", "Git URL")}</div>

      <form onSubmit={handleSubmit} className="panel panel-lit space-y-4 p-4">
        {mode === "zip" ? (
          <label
            htmlFor="zip-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-line bg-base px-4 py-8 text-center transition-colors hover:border-amber/50"
          >
            <span className="text-2xl text-faint">⤓</span>
            <span className="text-sm text-ink">
              {file ? file.name : "Drop or choose a .zip archive"}
            </span>
            <span className="text-[0.66rem] uppercase tracking-[0.14em] text-faint">
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} mb` : "max 50 mb"}
            </span>
            <input
              id="zip-file"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        ) : (
          <div>
            <label htmlFor="git-url" className="label mb-1.5 block">
              Public git repository
            </label>
            <div className="flex items-center border border-line bg-base focus-within:border-amber/60">
              <span className="select-none px-2.5 text-amber">$</span>
              <input
                id="git-url"
                type="text"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="field flex-1 border-0 bg-transparent focus:shadow-none"
              />
            </div>
          </div>
        )}

        {error ? (
          <div className="border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-amber/60 bg-amber/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber transition-colors hover:bg-amber hover:text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <span>
              dispatching<span className="blink">_</span>
            </span>
          ) : (
            "▸ Run Scan"
          )}
        </button>
      </form>
    </div>
  );
}
