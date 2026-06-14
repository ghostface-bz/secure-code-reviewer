import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { API_BASE } from "../api/client";

function CaretMark() {
  return (
    <div
      className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-lime"
      style={{ boxShadow: "0 0 0 1px rgba(196,242,74,.4), 0 6px 16px rgba(196,242,74,.18)" }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M7 8.5 L11 12 L7 15.5" stroke="#0a0b0d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="12.5" y="14" width="6" height="2.2" rx="1.1" fill="#0a0b0d" />
      </svg>
    </div>
  );
}

const GridIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const ShieldIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M12 3 4 6v5c0 4.5 3.2 8 8 10 4.8-2 8-5.5 8-10V6l-8-3Z" />
    <path d="M9.5 11.5 11.2 13.3 14.8 9.7" />
  </svg>
);

function NavItem({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center gap-[11px] rounded-lg px-[11px] py-2 font-medium transition-colors ${
          isActive ? "bg-lime/10 text-lime" : "text-dim hover:bg-white/[.04] hover:text-ink"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute -left-3 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-sm bg-lime" />
          ) : null}
          {icon}
          {label}
        </>
      )}
    </NavLink>
  );
}

const SECTION: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === "/", label: "findings · registry" },
  { match: (p) => p.startsWith("/new"), label: "new scan" },
  { match: (p) => /\/scans\/[^/]+\/findings\//.test(p), label: "finding detail" },
  { match: (p) => p.startsWith("/scans/"), label: "scan dashboard" },
];

export default function Layout() {
  const { pathname } = useLocation();
  const section = SECTION.find((s) => s.match(pathname))?.label ?? "";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-base text-ink">
      {/* ── sidebar ── */}
      <aside className="hidden w-[248px] flex-shrink-0 flex-col border-r border-line-side bg-bar md:flex">
        <Link to="/" className="flex items-center gap-[11px] px-[18px] pb-4 pt-5">
          <CaretMark />
          <div className="flex flex-col gap-0.5">
            <span className="mono text-[17px] font-semibold leading-none tracking-tight text-head">caret</span>
            <span className="mono text-[8.5px] font-medium leading-none tracking-[1.6px] text-fainter">STATIC ANALYSIS</span>
          </div>
        </Link>

        <nav className="flex flex-col gap-0.5 px-3 py-2">
          <NavItem to="/" end icon={GridIcon} label="Scans" />
          <NavItem to="/new" icon={ShieldIcon} label="New scan" />
        </nav>

        <div className="mx-[18px] my-1.5 border-t border-line-side" />

        <div className="mt-auto flex flex-col gap-3 border-t border-line-side px-4 py-3.5">
          <div className="flex items-center gap-2 rounded-lg border border-ok/15 bg-ok/[.07] px-2.5 py-2">
            <span className="h-[7px] w-[7px] rounded-full bg-ok" style={{ boxShadow: "0 0 6px #4ade80" }} />
            <span className="text-xs text-ok/90">3 scanners online</span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[11px] font-medium text-dim">self-hosted instance</span>
            <span className="mono truncate text-[10px] text-fainter">{API_BASE}</span>
          </div>
        </div>
      </aside>

      {/* ── main ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[57px] flex-shrink-0 items-center justify-between border-b border-line-side bg-base px-6">
          <div className="mono flex items-center gap-2 text-[13px] text-faint">
            <span className="text-lime md:hidden">caret</span>
            <span className="text-fainter">/</span>
            <span className="text-dim">{section}</span>
          </div>
          <Link
            to="/new"
            className="flex items-center gap-1.5 rounded-lg bg-lime px-3.5 py-2 text-[13px] font-semibold text-base transition-colors hover:bg-lime-bright"
            style={{ boxShadow: "0 4px 14px rgba(196,242,74,.18)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#0a0b0d" stroke="#0a0b0d" strokeWidth="2">
              <path d="M5 4v16M5 4l13 8-13 8" />
            </svg>
            Run scan
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
