"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

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

type TreatmentGoalObj = {
  summary?: string;
  goals?: string[];
  duration_months?: number | null;
  notes?: string;
} | null;

type Props = {
  payload?: any;
  images?: ImageItem[];
  className?: string;
  caseId?: string;
  onSaved?: () => void | Promise<void>;
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
      ? { bg: "color-mix(in oklab, var(--color-danger) 18%, transparent)", br: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))", fg: "#FECACA", label: "High" }
      : sev === "medium"
      ? { bg: "color-mix(in oklab, var(--color-warning) 18%, transparent)", br: "color-mix(in oklab, var(--color-warning) 55%, var(--border-alpha))", fg: "#FFEFC7", label: "Moderate" }
      : { bg: "color-mix(in oklab, var(--color-success) 18%, transparent)", br: "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))", fg: "#DCFCE7", label: "Low" };
  return (
    <span className="badge" style={{ background: styles.bg, borderColor: styles.br, color: styles.fg }} aria-label={`Severity ${styles.label}`}>
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
function coerceFinalGoal(val: any): string {
  if (typeof val === "string") return val.trim();
  if (val && typeof val === "object") {
    const parts: string[] = [];
    if (typeof val.summary === "string" && val.summary.trim()) parts.push(val.summary.trim());
    if (Array.isArray(val.goals) && val.goals.length) parts.push(val.goals.map((g: any) => `• ${String(g)}`).join(" "));
    if (Number.isFinite(val.duration_months)) parts.push(`Estimated duration: ${val.duration_months} months`);
    if (typeof val.notes === "string" && val.notes.trim()) parts.push(val.notes.trim());
    return parts.join(" ").trim();
  }
  return "";
}
function toNumberOrUndefined(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export default function StructuredReport({ payload, images = [], className = "", caseId, onSaved }: Props) {
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
  const tgfRaw: any = payload?.treatment_goal_final ?? payload?.final_treatment_goal ?? payload?.treatment_goal;
  const initialTgView = coerceFinalGoal(tgfRaw);

  const [editMode, setEditMode] = useState(false);
  const [tgSummary, setTgSummary] = useState<string>(typeof tgfRaw === "string" ? tgfRaw : String(tgfRaw?.summary ?? ""));
  const [tgGoals, setTgGoals] = useState<string>(Array.isArray(tgfRaw?.goals) ? tgfRaw.goals.join("\n") : "");
  const [tgDuration, setTgDuration] = useState<string>(tgfRaw?.duration_months == null ? "" : String(tgfRaw.duration_months));
  const [tgNotes, setTgNotes] = useState<string>(String(tgfRaw?.notes ?? ""));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [viewOverride, setViewOverride] = useState<string | null>(null);

  useEffect(() => {
    if (!editMode) {
      setTgSummary(typeof tgfRaw === "string" ? tgfRaw : String(tgfRaw?.summary ?? ""));
      setTgGoals(Array.isArray(tgfRaw?.goals) ? tgfRaw.goals.join("\n") : "");
      setTgDuration(tgfRaw?.duration_months == null ? "" : String(tgfRaw.duration_months));
      setTgNotes(String(tgfRaw?.notes ?? ""));
    }
  }, [payload?.treatment_goal_final, editMode]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 1800);
    return () => clearTimeout(t);
  }, [status]);

  const treatmentGoalView = viewOverride ?? initialTgView;

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

  const saveFinalGoal = async () => {
    if (!caseId || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthorized");
      const goals = tgGoals
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const patch: Record<string, any> = {
        treatment_goal_final: {
          summary: tgSummary || undefined,
          goals,
          duration_months: tgDuration.trim() === "" ? null : toNumberOrUndefined(tgDuration),
          notes: tgNotes || undefined,
        },
      };
      if (
        patch.treatment_goal_final &&
        Object.values(patch.treatment_goal_final).every((v) => v === undefined || (Array.isArray(v) && v.length === 0))
      ) {
        delete patch.treatment_goal_final;
      }
      const res = await fetch("/api/reports/template/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ caseId, patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to save");
      setViewOverride(coerceFinalGoal(patch.treatment_goal_final));
      setEditMode(false);
      setStatus({ kind: "ok", msg: "Saved" });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("report:templateUpserted", { detail: { caseId, patch } }));
      }
      await onSaved?.();
    } catch (e: any) {
      setStatus({ kind: "error", msg: e?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`card-lg ${className}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4">
          <h3 className="mb-2 text-sm font-semibold">Summary</h3>
          <p className="text-sm">{summary || "—"}</p>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Final treatment goal</h3>
            {caseId && !editMode && (
              <button className="btn btn-ghost btn-xs" onClick={() => setEditMode(true)}>Edit</button>
            )}
          </div>

          {!editMode && (
            <p className="text-sm">{treatmentGoalView || "—"}</p>
          )}

          {editMode && (
            <div className="space-y-2">
              <input
                className="input"
                placeholder="Summary"
                value={tgSummary}
                onChange={(e) => setTgSummary(e.target.value)}
              />
              <input
                className="input"
                placeholder="Duration (months)"
                value={tgDuration}
                onChange={(e) => setTgDuration(e.target.value)}
              />
              <textarea
                className="textarea"
                rows={3}
                placeholder="Goals (one per line)"
                value={tgGoals}
                onChange={(e) => setTgGoals(e.target.value)}
              />
              <textarea
                className="textarea"
                rows={3}
                placeholder="Notes"
                value={tgNotes}
                onChange={(e) => setTgNotes(e.target.value)}
              />
              {status && (
                <div
                  className="rounded-xl border px-3 py-2 text-sm"
                  style={{
                    background:
                      status.kind === "ok"
                        ? "color-mix(in oklab, var(--color-success) 14%, transparent)"
                        : "color-mix(in oklab, var(--color-danger) 14%, transparent)",
                    borderColor:
                      status.kind === "ok"
                        ? "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))"
                        : "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
                  }}
                >
                  {status.msg}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button className="btn btn-ghost" type="button" onClick={() => setEditMode(false)} disabled={saving}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="button" onClick={saveFinalGoal} disabled={saving} aria-busy={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
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
                                        style={{ background: "rgba(255,255,255,.03)", borderColor: "var(--border-alpha)" }}
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
                                          background: "color-mix(in oklab, var(--color-primary) 70%, transparent)",
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
