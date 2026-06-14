import { Link, Outlet, useLocation } from "react-router-dom";
import { API_BASE } from "../api/client";

function Reticle() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="text-amber" aria-hidden>
      <rect x="2.5" y="2.5" width="13" height="13" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M9 2.5V5.6 M9 12.4V15.5 M2.5 9H5.6 M12.4 9H15.5"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function Layout() {
  const { pathname } = useLocation();

  const tab = (to: string, label: string) => {
    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`relative px-3 py-2 text-xs uppercase tracking-[0.14em] transition-colors ${
          active ? "text-amber" : "text-dim hover:text-ink"
        }`}
      >
        {active ? <span className="mr-1.5 text-amber">▸</span> : null}
        {label}
        {active ? (
          <span className="absolute inset-x-2 -bottom-px h-px bg-amber" />
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-base/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Reticle />
            <span className="text-[0.95rem] font-semibold tracking-tight text-ink">
              SECURE<span className="text-amber">//</span>REVIEW
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {tab("/", "Scans")}
            {tab("/new", "New Scan")}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2 text-[0.62rem] uppercase tracking-[0.16em] text-faint">
          <span className="flex items-center gap-2">
            <span className="dot dot-live text-ok" />
            sast · sca · secrets — sandboxed
          </span>
          <span className="hidden truncate sm:block">{API_BASE}</span>
        </div>
      </footer>
    </div>
  );
}
