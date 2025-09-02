export type Tone = "primary" | "success" | "warning" | "danger" | "muted";
export type CaseStatus =
  | "approved"
  | "pending"
  | "in_review"
  | "rejected"
  | "closed"
  | "open"
  | "error"
  | "success"
  | "draft";

export const DEFAULT_LOCALE = "es";
export const DEFAULT_TZ = "UTC";

type Dateish = Date | string | number;

const toDate = (input: Dateish): Date | null => {
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
};

export function formatDate(input: Dateish, opts?: { locale?: string; timeZone?: string; month?: "short" | "long" }): string {
  const d = toDate(input);
  if (!d) return "";
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const timeZone = opts?.timeZone ?? DEFAULT_TZ;
  const month = opts?.month ?? "short";
  return new Intl.DateTimeFormat(locale, { timeZone, day: "2-digit", month, year: "numeric" }).format(d);
}

export function formatTime(input: Dateish, opts?: { locale?: string; timeZone?: string; seconds?: boolean }): string {
  const d = toDate(input);
  if (!d) return "";
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const timeZone = opts?.timeZone ?? DEFAULT_TZ;
  const second = opts?.seconds ?? false;
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", second: second ? "2-digit" : undefined, hour12: false }).format(d);
}

export function formatDateTime(input: Dateish, opts?: { locale?: string; timeZone?: string; seconds?: boolean; month?: "short" | "long" }): string {
  const d = toDate(input);
  if (!d) return "";
  const date = formatDate(d, { locale: opts?.locale, timeZone: opts?.timeZone, month: opts?.month });
  const time = formatTime(d, { locale: opts?.locale, timeZone: opts?.timeZone, seconds: opts?.seconds });
  return `${date} • ${time}`;
}

export function formatRelative(input: Dateish, opts?: { locale?: string; now?: Dateish }): string {
  const d = toDate(input);
  const n = toDate(opts?.now ?? Date.now());
  if (!d || !n) return "";
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const diffMs = d.getTime() - n.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: Array<["year" | "month" | "week" | "day" | "hour" | "minute" | "second", number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["week", 1000 * 60 * 60 * 24 * 7],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000]
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      const value = Math.round(diffMs / ms);
      return rtf.format(value, unit);
    }
  }
  return "";
}

export function formatCurrency(value: number, currency: string = "USD", opts?: { locale?: string; maximumFractionDigits?: number; minimumFractionDigits?: number }): string {
  if (!isFinite(value)) return "";
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
    minimumFractionDigits: opts?.minimumFractionDigits ?? 0
  }).format(value);
}

export function formatNumber(value: number, opts?: { locale?: string; decimals?: number }): string {
  if (!isFinite(value)) return "";
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const decimals = opts?.decimals ?? 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
}

export function formatPercent(value: number, opts?: { locale?: string; decimals?: number }): string {
  if (!isFinite(value)) return "";
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const decimals = opts?.decimals ?? 0;
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
}

export function formatBytes(bytes: number, opts?: { decimals?: number }): string {
  if (!isFinite(bytes)) return "";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = opts?.decimals ?? 1;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const v = bytes / Math.pow(k, i);
  return `${v.toFixed(dm)} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export function truncate(input: string, max: number, ellipsis: string = "…"): string {
  if (max <= 0) return "";
  if (input.length <= max) return input;
  return input.slice(0, Math.max(0, max - ellipsis.length)).trimEnd() + ellipsis;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cleanNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as Array<keyof T>) {
    const v = obj[k];
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function formatStatus(status: string | CaseStatus): { label: string; tone: Tone } {
  const key = String(status).toLowerCase() as CaseStatus;
  const map: Record<CaseStatus, { label: string; tone: Tone }> = {
    approved: { label: "Aprobado", tone: "success" },
    pending: { label: "Pendiente", tone: "warning" },
    in_review: { label: "En revisión", tone: "primary" },
    rejected: { label: "Rechazado", tone: "danger" },
    closed: { label: "Cerrado", tone: "muted" },
    open: { label: "Abierto", tone: "primary" },
    error: { label: "Error", tone: "danger" },
    success: { label: "Éxito", tone: "success" },
    draft: { label: "Borrador", tone: "muted" }
  };
  return map[key] ?? { label: titleCase(key.replace(/_/g, " ")), tone: "muted" };
}

export function parseCurrency(input: string, locale: string = DEFAULT_LOCALE): number | null {
  const example = new Intl.NumberFormat(locale).format(1000.1);
  const group = example.match(/[\s,.](?=\d{3}\b)/)?.[0] ?? ",";
  const decimal = example.replace(/\d/g, "")[example.replace(/\d/g, "").length - 1] ?? ".";
  const normalized = input
    .replace(new RegExp(`\\${group}`, "g"), "")
    .replace(new RegExp(`\\${decimal}`), ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return isFinite(n) ? n : null;
}
