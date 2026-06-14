import type {
  FindingsQuery,
  Finding,
  HealthResponse,
  ScanCreateResponse,
  ScanDetail,
  ScanListItem,
} from "./types";

/**
 * Base URL for the backend API. Falls back to localhost:8000/api for local
 * `npm run dev` usage outside docker compose.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000/api";

/** Error thrown for non-2xx responses, carrying status + parsed body if any. */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (err) {
    // Network failure (backend down, CORS, DNS, etc.)
    throw new ApiError(0, `Network error reaching ${API_BASE}${path}: ${String(err)}`);
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = undefined;
      }
    }
    const message =
      (body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : undefined) ?? `Request to ${path} failed with status ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  // Some endpoints (e.g. health) always return JSON; 204s would have no body.
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  health(): Promise<HealthResponse> {
    return request<HealthResponse>("/health");
  },

  /** POST /api/scans with a zip file (multipart/form-data) */
  createScanFromZip(file: File): Promise<ScanCreateResponse> {
    const form = new FormData();
    form.append("file", file);
    return request<ScanCreateResponse>("/scans", {
      method: "POST",
      body: form,
    });
  },

  /** POST /api/scans with a public git URL (application/json) */
  createScanFromGit(sourceRef: string): Promise<ScanCreateResponse> {
    return request<ScanCreateResponse>("/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_type: "git", source_ref: sourceRef }),
    });
  },

  /** GET /api/scans — newest first */
  listScans(): Promise<ScanListItem[]> {
    return request<ScanListItem[]>("/scans");
  },

  /** GET /api/scans/{id} */
  getScan(id: string): Promise<ScanDetail> {
    return request<ScanDetail>(`/scans/${id}`);
  },

  /** GET /api/scans/{id}/findings with optional filters */
  getFindings(id: string, query: FindingsQuery = {}): Promise<Finding[]> {
    const qs = buildQuery({
      severity: query.severity,
      tool: query.tool,
      cwe: query.cwe,
      file: query.file,
      q: query.q,
    });
    return request<Finding[]>(`/scans/${id}/findings${qs}`);
  },

  /** SSE endpoint URL for live scan progress — open with `new EventSource(...)` */
  scanEventsUrl(id: string): string {
    return `${API_BASE}/scans/${id}/events`;
  },

  /** URL for GET /api/scans/{id}/report.sarif (use directly as href/download link) */
  sarifUrl(id: string): string {
    return `${API_BASE}/scans/${id}/report.sarif`;
  },

  /** URL for GET /api/scans/{id}/report.pdf (stretch; may 501) */
  pdfUrl(id: string): string {
    return `${API_BASE}/scans/${id}/report.pdf`;
  },
};
