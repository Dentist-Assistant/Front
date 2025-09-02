// app/dentist/cases/[id]/components/StructuredReport.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "low" | "medium" | "high";
type ToothFinding = {
  tooth_fdi: number;
  findings: string[];
  severity?: string | null;
  confidence?: number | null;
  image_index?: number | null;
  image_id?: string | null;
};
type ImageItem = { id: string; url?: string; path?: string; caption?: string; index?: number };

type Props = {
  payload?: any;
  images?: ImageItem[];
  className?: string;
};

function fmtNum(n: unknown, unit: string) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : null;
  return v === null ? "—" : `${v.toFixed(2)} ${unit}`;
}
function fmtStr(s: unknown) {
  const v = typeof s === "string" && s.trim() ? s.trim() : null;
  return v ?? "—";
}
function fmtBool(b: unknown) {
  if (b === true) return "Yes";
  if (b === false) return "No";
  return "—";
}
function normSev(s?: string | null): Severity {
  const v = String(s || "").toLowerCase();
  if (v.includes("high") || v.includes("severe")) return "high";
  if (v.includes("mod") || v.includes("medium")) return "medium";
  return "low";
}
function sevBadge(s?: string | null) {
  const sev = normSev(s);
  const styles =
    sev === "high"
      ? {
          bg: "color-mix(in oklab, var(--color-danger) 18%, transparent)",
          br: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          fg: "#FECACA",
          label: "High",
        }
      : sev === "medium"
      ? {
          bg: "color-mix(in oklab, var(--color-warning) 18%, transparent)",
          br: "color-mix(in oklab, var(--color-warning) 55%, var(--border-alpha))",
          fg: "#FFEFC7",
          label: "Moderate",
        }
      : {
          bg: "color-mix(in oklab, var(--color-success) 18%, transparent)",
          br: "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))",
          fg: "#DCFCE7",
          label: "Low",
        };
  return (
    <span
      className="badge"
      style={{ background: styles.bg, borderColor: styles.br, color: styles.fg }}
      aria-label={`Severity ${styles.label}`}
    >
      {styles.label}
    </span>
  );
}
function normConf(val?: number | null): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 1) return n;
  if (n <= 100) return n / 100;
  if (n <= 10000) return (n / 100) / 100;
  return Math.min(1, Math.max(0, n / 100));
}

export default function StructuredReport({ payload, images = [], className = "" }: Props) {
  const summary: string =
    typeof payload?.summary === "string" && payload.summary.trim()
      ? payload.summary
      : typeof payload?.narrative === "string"
      ? payload.narrative
      : "";

  const measurements = payload?.measurements || {};
  const occlusion = payload?.occlusion || {};
  const hygiene = payload?.hygiene || {};
  const recommendations: string[] = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
  const treatmentGoal: string =
    typeof payload?.treatment_goal_final === "string" ? payload.treatment_goal_final : "";

  const findings: ToothFinding[] = useMemo(() => {
    const arr = Array.isArray(payload?.findings) ? (payload.findings as ToothFinding[]) : [];
    return arr.map((r) => ({
      tooth_fdi: r.tooth_fdi,
      findings: Array.isArray(r.findings) ? r.findings : [],
      severity: r.severity ?? null,
      confidence: r.confidence ?? null,
      image_index: typeof r.image_index === "number" ? r.image_index : null,
      image_id: typeof r.image_id === "string" ? r.image_id : null,
    }));
  }, [payload?.findings]);

  const derivedImages: ImageItem[] = useMemo(() => {
    const arr = Array.isArray(payload?.images) ? payload.images : [];
    const mapped = arr.map((x: any, i: number) => ({
      id: String(x?.id ?? x?.path ?? x?.storage_path ?? ""),
      url: typeof x?.url === "string" ? x.url : undefined,
      path: typeof x?.path === "string" ? x.path : typeof x?.storage_path === "string" ? x.storage_path : undefined,
      caption: typeof x?.caption === "string" ? x.caption : x?.path || x?.storage_path || undefined,
      index: typeof x?.index === "number" ? x.index : i,
    }));
    const extra = images.map((it, i) => ({
      id: it.id,
      url: it.url,
      path: it.path,
      caption: it.caption ?? it.id,
      index: typeof it.index === "number" ? it.index : i,
    }));
    const byId = new Map<string, ImageItem>();
    [...mapped, ...extra].forEach((it) => {
      if (!byId.has(it.id)) byId.set(it.id, it);
    });
    return Array.from(byId.values()).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }, [payload?.images, images]);

  const [signed, setSigned] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const toSign = derivedImages.filter((it) => !it.url && it.path);
    if (!toSign.length) return;
    (async () => {
      const entries: [string, string][] = [];
      for (const it of toSign) {
        try {
          const res = await fetch(`/api/storage/sign?path=${encodeURIComponent(it.path as string)}`);
          const j = await res.json().catch(() => ({}));
          const url = j?.url || j?.signedUrl || "";
          if (url) entries.push([it.id, url]);
        } catch {}
      }
      if (!cancelled && entries.length) {
        setSigned((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [derivedImages.map((i) => `${i.id}:${i.url || i.path || ""}`).join("|")]);

  const manifestById = useMemo(() => {
    const m = new Map<string, { url?: string; caption?: string; index?: number }>();
    derivedImages.forEach((it) => {
      m.set(it.id, { url: it.url || signed[it.id], caption: it.caption, index: it.index });
    });
    return m;
  }, [derivedImages, signed]);

  const groups = useMemo(() => {
    const byKey = new Map<
      string,
      {
        key: string;
        title: string;
        imageId?: string;
        imageUrl?: string;
        items: ToothFinding[];
        index?: number;
      }
    >();

    const add = (key: string, title: string, item: ToothFinding, imageId?: string, index?: number) => {
      const g = byKey.get(key) || { key, title, imageId, imageUrl: undefined, items: [], index };
      g.items.push(item);
      if (imageId) {
        const meta = manifestById.get(imageId);
        if (meta?.url) g.imageUrl = meta.url;
        g.index = typeof index === "number" ? index : g.index;
      }
      byKey.set(key, g);
    };

    findings.forEach((f) => {
      if (f.image_id && manifestById.has(f.image_id)) {
        const meta = manifestById.get(f.image_id)!;
        add(`img:${f.image_id}`, meta.caption || f.image_id, f, f.image_id, meta.index);
      } else if (typeof f.image_index === "number") {
        add(`idx:${f.image_index}`, `Image #${f.image_index + 1}`, f, undefined, f.image_index);
      } else {
        add("unassigned", "Unassigned", f);
      }
    });

    const arr = Array.from(byKey.values());
    return arr.sort((a, b) => {
      if (a.key === "unassigned") return 1;
      if (b.key === "unassigned") return -1;
      const ai = typeof a.index === "number" ? a.index : 9999;
      const bi = typeof b.index === "number" ? b.index : 9999;
      return ai - bi;
    });
  }, [findings, manifestById]);

  return (
    <section className={`card-lg ${className}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4">
          <h3 className="mb-2 text-sm font-semibold">Summary</h3>
          <p className="text-sm">{summary || "—"}</p>
        </div>

        <div className="rounded-2xl border p-4">
          <h3 className="mb-2 text-sm font-semibold">Treatment Goal</h3>
          <p className="text-sm">{treatmentGoal || "—"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border p-4">
          <div className="font-medium mb-1">Measurements</div>
          <ul className="space-y-1 text-sm">
            <li>Overjet: {fmtNum(measurements?.overjet_mm, "mm")}</li>
            <li>Overbite: {fmtNum(measurements?.overbite_percent, "%")}</li>
            <li>Midline dev: {fmtNum(measurements?.midline_deviation_mm, "mm")}</li>
            <li>Crowding U: {fmtNum(measurements?.crowding_upper_mm, "mm")}</li>
            <li>Crowding L: {fmtNum(measurements?.crowding_lower_mm, "mm")}</li>
            <li>Arch length U: {fmtNum(measurements?.arch_length_upper_mm, "mm")}</li>
            <li>Arch length L: {fmtNum(measurements?.arch_length_lower_mm, "mm")}</li>
          </ul>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="font-medium mb-1">Occlusion</div>
          <ul className="space-y-1 text-sm">
            <li>Class R: {fmtStr(occlusion?.class_right)}</li>
            <li>Class L: {fmtStr(occlusion?.class_left)}</li>
            <li>Open bite: {fmtBool(occlusion?.open_bite)}</li>
            <li>Crossbite: {fmtBool(occlusion?.crossbite)}</li>
            <li>Overjet tend.: {fmtStr(occlusion?.overjet_tendency)}</li>
            <li>Overbite tend.: {fmtStr(occlusion?.overbite_tendency)}</li>
          </ul>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="font-medium mb-1">Hygiene</div>
          <ul className="space-y-1 text-sm">
            <li>Plaque: {fmtStr(hygiene?.plaque)}</li>
            <li>Calculus: {fmtStr(hygiene?.calculus)}</li>
            <li>Gingival infl.: {fmtStr(hygiene?.gingival_inflammation)}</li>
            <li>Bleeding: {fmtStr(hygiene?.bleeding_on_probing)}</li>
          </ul>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="font-medium mb-1">Recommendations</div>
          <ul className="mt-1 space-y-1 text-sm">
            {recommendations.length ? (
              recommendations.map((r, i) => <li key={i}>• {r}</li>)
            ) : (
              <li className="muted">—</li>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border p-4">
        <h3 className="mb-3 text-sm font-semibold">Findings by Image</h3>
        {groups.length === 0 ? (
          <div className="empty">
            <div className="h-8 w-8 rounded-xl bg-white/5" />
            <p>No findings</p>
            <p className="text-sm muted">Run Draft AI or add findings.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => {
              const showThumb = typeof g.imageUrl === "string" && g.imageUrl;
              return (
                <div key={g.key} className="rounded-2xl border">
                  <div className="flex items-center justify-between border-b p-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{g.title}</h4>
                      {typeof g.index === "number" ? <span className="badge badge-muted">#{g.index + 1}</span> : null}
                    </div>
                    <span className="badge badge-muted">{g.items.length}</span>
                  </div>
                  <div className="p-3">
                    {showThumb && (
                      <div className="mb-3 overflow-hidden rounded-xl border bg-black">
                        <img src={g.imageUrl as string} alt={g.title} className="h-48 w-full object-contain" />
                      </div>
                    )}
                    <div className="overflow-auto rounded-xl border">
                      <table className="table min-w-[520px]">
                        <colgroup>
                          <col style={{ width: "90px" }} />
                          <col />
                          <col style={{ width: "120px" }} />
                          <col style={{ width: "140px" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Tooth FDI</th>
                            <th>Findings</th>
                            <th>Severity</th>
                            <th>Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((it, i) => {
                            const confPct = Math.round(normConf(it.confidence) * 100);
                            return (
                              <tr key={`${it.tooth_fdi}-${i}`}>
                                <td>
                                  <span className="inline-flex h-7 min-w-12 items-center justify-center rounded-lg border px-2">
                                    {it.tooth_fdi}
                                  </span>
                                </td>
                                <td>
                                  <div className="flex flex-wrap gap-1.5">
                                    {(it.findings || []).map((f, k) => (
                                      <span
                                        key={k}
                                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                                        style={{
                                          background: "rgba(255,255,255,.03)",
                                          borderColor: "var(--border-alpha)",
                                        }}
                                        title={f}
                                      >
                                        {f}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td>{sevBadge(it.severity)}</td>
                                <td className="min-w-[120px]">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                      <div
                                        className="h-2 rounded-full"
                                        style={{
                                          width: `${Math.min(100, Math.max(0, confPct))}%`,
                                          background:
                                            "color-mix(in oklab, var(--color-primary) 70%, transparent)",
                                        }}
                                        aria-valuenow={confPct}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        role="progressbar"
                                      />
                                    </div>
                                    <span className="w-12 text-right text-xs tabular-nums">{confPct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
