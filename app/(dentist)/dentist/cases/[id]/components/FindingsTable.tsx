// app/dentist/cases/[id]/components/FindingsTable.tsx
"use client";

import { useMemo, useState } from "react";
import { Copy, Image as ImageIcon } from "lucide-react";

type Severity = "low" | "moderate" | "high";

type GeometryPoint = { x: number; y: number; norm?: boolean };
type Geometry = {
  circles?: { cx: number; cy: number; r: number; norm?: boolean }[];
  lines?: { x1: number; y1: number; x2: number; y2: number; norm?: boolean }[];
  boxes?: { x: number; y: number; w: number; h: number; norm?: boolean }[];
  polygons?: { points: GeometryPoint[]; norm?: boolean }[];
};

export type ToothFindingRow = {
  tooth_fdi: number;
  findings: string[];
  severity?: string | null;
  confidence?: number | null;
  image_index: number;
  image_id: string;
  geometry?: Geometry | null;
};

type SortKey = "tooth_fdi" | "severity" | "confidence" | "image_index" | "has_geometry";
type SortDir = "asc" | "desc";

type Props = {
  rows?: ToothFindingRow[] | null;
  compact?: boolean;

  /** Overlay interaction */
  activeOverlayIds?: Array<string | number>;
  hoverOverlayId?: string | number | null;
  onHoverFinding?: (overlayId: string | number | null, row?: ToothFindingRow) => void;
  onSelectFinding?: (overlayId: string | number, row: ToothFindingRow) => void;

  /** Back-compat (optional) */
  onSelectTooth?: (toothFdi: number) => void;

  /** Trigger AI */
  onRunDraft?: () => void | Promise<void>;
  draftBusy?: boolean;
};

function normalizeConfidence(val?: number | null): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 1) return n;
  if (n <= 100) return n / 100;
  if (n <= 10000) return (n / 100) / 100;
  return Math.min(1, Math.max(0, n / 100));
}

function normSeverity(sev?: string | null): Severity | null {
  if (!sev) return null;
  const s = sev.toLowerCase().trim();
  if (s.includes("high") || s.includes("severe")) return "high";
  if (s.includes("mod") || s.includes("medium")) return "moderate";
  return "low";
}

function labelSeverity(s?: Severity | null) {
  if (!s) return "Unknown";
  if (s === "low") return "Low";
  if (s === "moderate") return "Moderate";
  if (s === "high") return "High";
  return s;
}

function hasGeometry(g?: Geometry | null) {
  if (!g) return false;
  return Boolean(
    (Array.isArray(g.circles) && g.circles.length) ||
      (Array.isArray(g.lines) && g.lines.length) ||
      (Array.isArray(g.boxes) && g.boxes.length) ||
      (Array.isArray(g.polygons) && g.polygons.length)
  );
}

function geometryGlyphs(g?: Geometry | null) {
  if (!g) return "";
  const parts: string[] = [];
  if (g.circles?.length) parts.push(`◯${g.circles.length > 1 ? `×${g.circles.length}` : ""}`);
  if (g.lines?.length) parts.push(`─${g.lines.length > 1 ? `×${g.lines.length}` : ""}`);
  if (g.polygons?.length) parts.push(`△${g.polygons.length > 1 ? `×${g.polygons.length}` : ""}`);
  if (g.boxes?.length) parts.push(`▭${g.boxes.length > 1 ? `×${g.boxes.length}` : ""}`);
  return parts.join(" ");
}

function overlayIdForRow(r: ToothFindingRow): string {
  return `${r.image_index}:${r.tooth_fdi}`;
}

function truncateMiddle(s: string, max = 28) {
  if (!s || s.length <= max) return s;
  const keep = Math.max(6, Math.floor((max - 3) / 2));
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

export default function FindingsTable({
  rows = [],
  compact = false,
  activeOverlayIds = [],
  hoverOverlayId = null,
  onHoverFinding,
  onSelectFinding,
  onSelectTooth,
  onRunDraft,
  draftBusy = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [imageFilter, setImageFilter] = useState<"all" | number>("all");
  const [sortKey, setSortKey] = useState<SortKey>("tooth_fdi");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);

  const severityOptions = useMemo(() => {
    const set = new Set<Severity>();
    (rows || []).forEach((r) => {
      const s = normSeverity(r.severity);
      if (s) set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const imageIndexCounts = useMemo(() => {
    const map = new Map<number, number>();
    (rows || []).forEach((r) => map.set(r.image_index, (map.get(r.image_index) || 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([idx, count]) => ({ idx, count }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = (rows || []).filter((r) => {
      const matchesText =
        !q ||
        r.tooth_fdi.toString().includes(q) ||
        (r.findings || []).some((f) => f.toLowerCase().includes(q)) ||
        (r.severity ? r.severity.toLowerCase().includes(q) : false) ||
        r.image_id.toLowerCase().includes(q);

      const conf = normalizeConfidence(r.confidence);
      const meetsConf = conf >= minConfidence;

      const sev = normSeverity(r.severity);
      const meetsSev = severityFilter === "all" ? true : sev === severityFilter;

      const meetsImg = imageFilter === "all" ? true : r.image_index === imageFilter;

      return matchesText && meetsConf && meetsSev && meetsImg;
    });

    out = out.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "tooth_fdi":
          return (a.tooth_fdi - b.tooth_fdi) * dir;
        case "confidence":
          return (normalizeConfidence(a.confidence) - normalizeConfidence(b.confidence)) * dir;
        case "severity":
          return (labelSeverity(normSeverity(a.severity)) || "").localeCompare(
            labelSeverity(normSeverity(b.severity)) || ""
          ) * dir;
        case "image_index":
          return (a.image_index - b.image_index) * dir;
        case "has_geometry":
          return ((hasGeometry(a.geometry) ? 1 : 0) - (hasGeometry(b.geometry) ? 1 : 0)) * dir;
      }
    });

    return out;
  }, [rows, search, minConfidence, severityFilter, imageFilter, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "tooth_fdi",
      "findings",
      "severity",
      "confidence_percent",
      "image_index",
      "image_id",
      "has_geometry",
    ];
    const lines = [header.join(",")];
    filtered.forEach((r) => {
      const confPct = Math.round(normalizeConfidence(r.confidence) * 100);
      lines.push(
        [
          r.tooth_fdi,
          quoteCsv((r.findings || []).join(" | ")),
          normSeverity(r.severity) || "",
          confPct,
          r.image_index,
          quoteCsv(r.image_id),
          hasGeometry(r.geometry) ? "1" : "0",
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "findings.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunDraft = async () => {
    if (!onRunDraft || draftBusy) return;
    await Promise.resolve(onRunDraft());
  };

  const copyTemplate = (r: ToothFindingRow) => {
    const template = `Tooth ${r.tooth_fdi}: ${r.findings.join("; ")}. Evidence: image ${r.image_index}.`;
    navigator.clipboard?.writeText(template).catch(() => {});
  };

  return (
    <section className="card-lg">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Findings</h3>
          <p className="text-sm muted">
            {filtered.length} of {rows?.length ?? 0} rows
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <label className="label mb-1">Search</label>
            <input
              type="search"
              placeholder="Search tooth, text, severity, image id…"
              className="input pr-9 w-[260px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search findings"
            />
            <span className="pointer-events-none absolute right-2 bottom-2 text-xs muted">⌘K</span>
          </div>

          <div className="space-y-1">
            <label htmlFor="imageFilter" className="label">
              Image
            </label>
            <select
              id="imageFilter"
              className="select w-[160px]"
              value={imageFilter}
              onChange={(e) => setImageFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              aria-label="Filter by image"
            >
              <option value="all">All images</option>
              {imageIndexCounts.map(({ idx, count }) => (
                <option key={idx} value={idx}>
                  #{idx} ({count})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="minconf" className="label">
              Min conf. ({minConfidence.toFixed(2)})
            </label>
            <input
              id="minconf"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="range w-[200px]"
              aria-label="Minimum confidence"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="severity" className="label">
              Severity
            </label>
            <select
              id="severity"
              className="select w-[170px]"
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(e.target.value === "all" ? "all" : (e.target.value as Severity))
              }
              aria-label="Severity filter"
            >
              <option value="all">All</option>
              {severityOptions.map((s) => (
                <option key={s} value={s}>
                  {labelSeverity(s)}
                </option>
              ))}
            </select>
          </div>

          <button onClick={exportCsv} className="btn btn-outline">
            Export CSV
          </button>

          <button onClick={handleRunDraft} disabled={!onRunDraft || draftBusy} className="btn btn-primary">
            {draftBusy ? "Drafting…" : "Run Draft AI"}
          </button>
        </div>
      </div>

      {rows && rows.length > 0 ? (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className={`table table-fixed min-w-[1280px] ${compact ? "" : ""}`}>
            {/* Column widths - rendered as an array to avoid whitespace text nodes inside <colgroup> */}
            <colgroup>
              {[
                <col key="c1" style={{ width: "96px" }} />,   // Tooth
                <col key="c2" style={{ width: "160px" }} />,  // Image idx/id
                <col key="c3" style={{ width: "94px" }} />,   // Geometry
                <col key="c4" />,                              // Findings
                <col key="c5" style={{ width: "260px" }} />,  // Template
                <col key="c6" style={{ width: "132px" }} />,  // Severity
                <col key="c7" style={{ width: "230px" }} />,  // Confidence
              ]}
            </colgroup>
            <thead>
              <tr>
                <th>
                  <button onClick={() => onSort("tooth_fdi")} className="inline-flex items-center gap-1" aria-label="Sort by tooth">
                    Tooth FDI
                    <SortIcon active={sortKey === "tooth_fdi"} dir={sortDir} />
                  </button>
                </th>
                <th>
                  <button onClick={() => onSort("image_index")} className="inline-flex items-center gap-1" aria-label="Sort by image">
                    Image
                    <SortIcon active={sortKey === "image_index"} dir={sortDir} />
                  </button>
                </th>
                <th>
                  <button onClick={() => onSort("has_geometry")} className="inline-flex items-center gap-1" aria-label="Sort by geometry">
                    Geo
                    <SortIcon active={sortKey === "has_geometry"} dir={sortDir} />
                  </button>
                </th>
                <th>Findings</th>
                <th>Template</th>
                <th>
                  <button onClick={() => onSort("severity")} className="inline-flex items-center gap-1" aria-label="Sort by severity">
                    Severity
                    <SortIcon active={sortKey === "severity"} dir={sortDir} />
                  </button>
                </th>
                <th>
                  <button onClick={() => onSort("confidence")} className="inline-flex items-center gap-1" aria-label="Sort by confidence">
                    Confidence
                    <SortIcon active={sortKey === "confidence"} dir={sortDir} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const pct = Math.round(normalizeConfidence(r.confidence) * 100);
                const overlayId = overlayIdForRow(r);
                const isActive =
                  activeOverlayIds.map(String).includes(String(overlayId)) ||
                  String(hoverOverlayId ?? "") === String(overlayId);

                return (
                  <tr
                    key={`${r.tooth_fdi}-${r.image_index}-${r.image_id}-${(r.findings || []).join("|")}`}
                    className={`cursor-pointer transition-colors ${isActive ? "bg-white/5" : ""}`}
                    onMouseEnter={() => onHoverFinding?.(overlayId, r)}
                    onMouseLeave={() => onHoverFinding?.(null)}
                    onClick={() => {
                      onSelectFinding?.(overlayId, r);
                      onSelectTooth?.(r.tooth_fdi);
                    }}
                    title={`Overlay: ${overlayId}`}
                  >
                    {/* Tooth */}
                    <td className="font-medium">
                      <span
                        className="inline-flex h-7 min-w-12 items-center justify-center rounded-lg border px-2"
                        style={{
                          borderColor: isActive ? "var(--color-primary)" : "var(--border-alpha)",
                          boxShadow: isActive ? "0 0 0 2px color-mix(in oklab, var(--color-primary) 30%, transparent)" : undefined,
                        }}
                      >
                        {r.tooth_fdi}
                      </span>
                    </td>

                    {/* Image (index + id) */}
                    <td>
                      <div className="flex flex-col">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="badge">#{r.image_index}</span>
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-0.5 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setImageFilter(r.image_index);
                            }}
                            title="Filter by this image"
                          >
                            Filter
                          </button>
                        </div>
                        <div className="mt-0.5 truncate text-xs muted" title={r.image_id}>
                          {truncateMiddle(r.image_id, 28)}
                        </div>
                      </div>
                    </td>

                    {/* Geometry indicator */}
                    <td>
                      {hasGeometry(r.geometry) ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                          style={{
                            background: "rgba(255,255,255,.03)",
                            borderColor: isActive ? "var(--color-primary)" : "var(--border-alpha)",
                            color: isActive ? "var(--color-primary)" : "inherit",
                          }}
                          title={geometryGlyphs(r.geometry)}
                        >
                          <span aria-hidden>★</span>
                          {geometryGlyphs(r.geometry)}
                        </span>
                      ) : (
                        <span className="text-xs muted">—</span>
                      )}
                    </td>

                    {/* Findings list */}
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {(r.findings || []).map((f, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                            style={{ background: "rgba(255,255,255,.03)", borderColor: "var(--border-alpha)" }}
                            title={f}
                          >
                            {f}
                            <button
                              type="button"
                              className="ml-1 inline-flex items-center rounded-md p-0.5 hover:bg-white/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImageId(r.image_id);
                              }}
                              aria-label="Preview related image"
                              title="Preview related image"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Template (copyable) */}
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs">
                          Tooth {r.tooth_fdi}: {(r.findings || []).join("; ")}. Evidence: image {r.image_index}.
                        </span>
                        <button
                          className="btn btn-ghost px-2 py-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyTemplate(r);
                          }}
                          title="Copy template"
                          aria-label="Copy template"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </td>

                    {/* Severity */}
                    <td>
                      <SeverityBadge severity={normSeverity(r.severity)} />
                    </td>

                    {/* Confidence */}
                    <td className="min-w-[230px]">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, Math.round(normalizeConfidence(r.confidence) * 100)))}%`,
                              background: "color-mix(in oklab, var(--color-primary) 70%, transparent)",
                            }}
                            role="progressbar"
                            aria-valuenow={Math.round(normalizeConfidence(r.confidence) * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums">
                          {Math.round(normalizeConfidence(r.confidence) * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6">
                    <div className="empty">
                      <div className="h-8 w-8 rounded-xl bg-white/5" />
                      <p>No matching findings</p>
                      <p className="text-sm muted">Try adjusting the search or filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <div className="h-8 w-8 rounded-xl bg-white/5" />
          <p>No findings yet</p>
          <p className="text-sm muted">Run Draft AI to populate this table.</p>
        </div>
      )}

      {/* Quick preview of image by image_id (expects the page/viewer to handle signing externally if needed) */}
      {previewImageId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewImageId(null)}
        >
          <div className="max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border bg-[var(--color-surface)]">
            <div className="p-2 text-xs muted border-b">Image ID: {previewImageId}</div>
            <div className="p-3 text-sm">
              This preview opens by image_id. To show the actual image, resolve image_id → signed URL in your parent and
              pass it to an image modal, or wire it with your gallery.
            </div>
            <div className="flex justify-end p-2">
              <button className="btn btn-ghost" onClick={() => setPreviewImageId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SeverityBadge({ severity }: { severity?: Severity | null }) {
  const base = "badge";
  if (!severity) return <span className={`${base} badge-muted`}>Unknown</span>;
  if (severity === "low")
    return (
      <span
        className={base}
        style={{
          background: "color-mix(in oklab, var(--color-success) 18%, transparent)",
          borderColor: "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))",
          color: "#DCFCE7",
        }}
      >
        Low
      </span>
    );
  if (severity === "moderate")
    return (
      <span
        className={base}
        style={{
          background: "color-mix(in oklab, var(--color-warning) 18%, transparent)",
          borderColor: "color-mix(in oklab, var(--color-warning) 55%, var(--border-alpha))",
          color: "#FFEFC7",
        }}
      >
        Moderate
      </span>
    );
  if (severity === "high")
    return (
      <span
        className={base}
        style={{
          background: "color-mix(in oklab, var(--color-danger) 18%, transparent)",
          borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          color: "#FECACA",
        }}
      >
        High
      </span>
    );
  return <span className={`${base} badge-muted`}>{labelSeverity(severity)}</span>;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span aria-hidden="true" className="inline-block h-4 w-4" style={{ opacity: active ? 1 : 0.4 }}>
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

function quoteCsv(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
